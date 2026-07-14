pub mod dispatch;
pub mod handlers;
pub mod http;
pub mod runner;
pub mod sessions;
pub mod transport;

use std::io;
use std::process::{Command, Stdio};

use handlers::BuiltinHandlers;
use runner::RunnerError;
use thiserror::Error;
use transport::JsonlTransport;

#[derive(Debug, Error)]
pub enum WorkerError {
    #[error(transparent)]
    Runner(#[from] RunnerError),

    #[error(transparent)]
    Http(#[from] http::HttpServerError),

    #[error("invalid worker arguments: {0}")]
    Arguments(String),

    #[error("failed to spawn detached worker: {0}")]
    Spawn(#[from] std::io::Error),
}

pub fn run_stdio() -> Result<(), WorkerError> {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut transport = JsonlTransport::new(stdin.lock(), stdout.lock());
    let mut handlers = BuiltinHandlers::default();

    runner::run(&mut transport, &mut handlers)?;
    Ok(())
}

pub fn run_http(port: u16, token: String) -> Result<(), WorkerError> {
    let mut handlers = BuiltinHandlers::default();
    http::run(port, token, &mut handlers)?;
    Ok(())
}

pub fn spawn_detached_http(port: u16, token: String) -> Result<(), WorkerError> {
    let executable = std::env::current_exe()?;
    let mut command = Command::new(executable);
    command
        .arg("--http")
        .arg("--port")
        .arg(port.to_string())
        .arg("--token")
        .arg(token)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000 | 0x0000_0200 | 0x0000_0008);
    }

    command.spawn()?;
    Ok(())
}
