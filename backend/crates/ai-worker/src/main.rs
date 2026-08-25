#![cfg_attr(windows, windows_subsystem = "windows")]

use std::time::Instant;

fn main() -> Result<(), ai_worker::WorkerError> {
    let started_at = Instant::now();
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if !args
        .iter()
        .any(|argument| argument == "--http" || argument == "--detach-http")
    {
        ai_worker::startup_log(started_at, "process.start mode=stdio");
        return ai_worker::run_stdio();
    }

    let port = argument_value(&args, "--port")
        .unwrap_or("22514")
        .parse::<u16>()
        .map_err(|error| ai_worker::WorkerError::Arguments(error.to_string()))?;
    let token = argument_value(&args, "--token")
        .unwrap_or("pixcall-ai-tagger-v4")
        .to_string();
    let host_port = argument_value(&args, "--host-port")
        .map(str::parse::<u16>)
        .transpose()
        .map_err(|error| ai_worker::WorkerError::Arguments(error.to_string()))?;
    if args.iter().any(|argument| argument == "--detach-http") {
        ai_worker::startup_log(
            started_at,
            format!("process.start mode=detach-http port={port} host_port={host_port:?}"),
        );
        ai_worker::spawn_detached_http(port, token, host_port, started_at)
    } else {
        ai_worker::startup_log(
            started_at,
            format!("process.start mode=http port={port} host_port={host_port:?}"),
        );
        ai_worker::run_http(port, token, host_port, started_at)
    }
}

fn argument_value<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.windows(2)
        .find(|pair| pair[0] == name)
        .map(|pair| pair[1].as_str())
}
