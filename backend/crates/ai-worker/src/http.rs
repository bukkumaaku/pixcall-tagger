use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
};

use protocol::{Request, Response, error_codes};
use serde::Serialize;
use thiserror::Error;

use crate::{
    dispatch,
    handlers::{CommandHandler, EventEmitter, HandlerError, HandlerResult},
};

#[derive(Debug, Error)]
pub enum HttpServerError {
    #[error("HTTP worker I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("HTTP worker serialization error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("worker shutdown failed: {0}")]
    Shutdown(#[from] HandlerError),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MessageEnvelope {
    messages: Vec<Response>,
}

struct CollectedEvents {
    request_id: String,
    messages: Vec<Response>,
}

impl EventEmitter for CollectedEvents {
    fn progress(&mut self, payload: protocol::ProgressPayload) -> HandlerResult<()> {
        self.messages
            .push(Response::progress(self.request_id.clone(), payload));
        Ok(())
    }
}

struct HttpRequest {
    method: String,
    path: String,
    token: String,
    body: Vec<u8>,
}

pub fn run<H: CommandHandler>(
    port: u16,
    token: String,
    handlers: &mut H,
) -> Result<(), HttpServerError> {
    let listener = TcpListener::bind(("127.0.0.1", port))?;
    let mut shutdown = false;
    while !shutdown {
        let (stream, _) = listener.accept()?;
        shutdown = handle_connection(stream, &token, handlers)?;
    }
    handlers.shutdown()?;
    Ok(())
}

fn handle_connection<H: CommandHandler>(
    mut stream: TcpStream,
    expected_token: &str,
    handlers: &mut H,
) -> Result<bool, HttpServerError> {
    let request = match read_request(&stream) {
        Ok(request) => request,
        Err(error) => {
            write_json(
                &mut stream,
                400,
                &serde_json::json!({ "error": error.to_string() }),
            )?;
            return Ok(false);
        }
    };

    if request.method == "OPTIONS" {
        write_empty(&mut stream, 204)?;
        return Ok(false);
    }
    if request.path == "/health" {
        write_json(&mut stream, 200, &serde_json::json!({ "ok": true }))?;
        return Ok(false);
    }
    if request.token != expected_token {
        write_json(
            &mut stream,
            401,
            &serde_json::json!({ "error": "unauthorized" }),
        )?;
        return Ok(false);
    }
    if request.path == "/shutdown" {
        write_json(&mut stream, 200, &serde_json::json!({ "ok": true }))?;
        return Ok(true);
    }
    if request.method != "POST" || request.path != "/request" {
        write_json(
            &mut stream,
            404,
            &serde_json::json!({ "error": "not found" }),
        )?;
        return Ok(false);
    }

    let parsed = serde_json::from_slice::<Request>(&request.body);
    let mut messages = Vec::new();
    match parsed {
        Ok(request) => {
            let request_id = request.request_id.clone();
            let mut events = CollectedEvents {
                request_id,
                messages: Vec::new(),
            };
            let response = dispatch::dispatch(request, handlers, &mut events);
            messages.append(&mut events.messages);
            messages.push(response);
        }
        Err(error) => messages.push(Response::error(
            None,
            error_codes::BAD_MESSAGE,
            format!("Failed to parse JSON: {error}"),
        )),
    }
    write_json(&mut stream, 200, &MessageEnvelope { messages })?;
    Ok(false)
}

fn read_request(stream: &TcpStream) -> Result<HttpRequest, std::io::Error> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let path = parts.next().unwrap_or_default().to_string();
    if method.is_empty() || path.is_empty() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "invalid request line",
        ));
    }

    let mut content_length = 0usize;
    let mut token = String::new();
    loop {
        let mut line = String::new();
        reader.read_line(&mut line)?;
        if line == "\r\n" || line == "\n" || line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            match name.trim().to_ascii_lowercase().as_str() {
                "content-length" => {
                    content_length = value.trim().parse().unwrap_or_default();
                }
                "x-pixcall-ai-token" => token = value.trim().to_string(),
                _ => {}
            }
        }
    }
    let mut body = vec![0; content_length];
    reader.read_exact(&mut body)?;
    Ok(HttpRequest {
        method,
        path,
        token,
        body,
    })
}

fn write_json(
    stream: &mut TcpStream,
    status: u16,
    value: &impl Serialize,
) -> Result<(), HttpServerError> {
    let body = serde_json::to_vec(value)?;
    write_response(stream, status, "application/json; charset=utf-8", &body)
}

fn write_empty(stream: &mut TcpStream, status: u16) -> Result<(), HttpServerError> {
    write_response(stream, status, "text/plain", &[])
}

fn write_response(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &[u8],
) -> Result<(), HttpServerError> {
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        _ => "Error",
    };
    write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: content-type,x-pixcall-ai-token\r\nAccess-Control-Allow-Methods: GET,POST,OPTIONS\r\nConnection: close\r\n\r\n",
        body.len()
    )?;
    stream.write_all(body)?;
    stream.flush()?;
    Ok(())
}
