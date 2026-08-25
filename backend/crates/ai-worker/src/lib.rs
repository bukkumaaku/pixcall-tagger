pub mod dispatch;
pub mod handlers;
pub mod http;
pub mod runner;
pub mod sessions;
pub mod transport;

use std::{
    fs::OpenOptions,
    io::{self, Write},
    process::{Command, Stdio},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

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

pub fn append_startup_log(event: impl AsRef<str>) {
    let path = std::env::temp_dir()
        .join("pixcall-ai-tagger")
        .join("ai-worker-startup.log");
    let Some(directory) = path.parent() else {
        return;
    };
    if std::fs::create_dir_all(directory).is_err() {
        return;
    }
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let wall_clock_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis());
    let _ = writeln!(
        file,
        "{wall_clock_ms} pid={} {}",
        std::process::id(),
        event.as_ref(),
    );
}

pub fn startup_log(started_at: Instant, event: impl AsRef<str>) {
    let elapsed_ms = started_at.elapsed().as_secs_f64() * 1000.0;
    append_startup_log(format!("+{elapsed_ms:.1}ms {}", event.as_ref()));
}

pub fn run_stdio() -> Result<(), WorkerError> {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut transport = JsonlTransport::new(stdin.lock(), stdout.lock());
    let mut handlers = BuiltinHandlers::default();

    runner::run(&mut transport, &mut handlers)?;
    Ok(())
}

pub fn run_http(
    port: u16,
    token: String,
    host_port: Option<u16>,
    started_at: Instant,
) -> Result<(), WorkerError> {
    startup_log(started_at, "http.handlers_init.begin");
    let mut handlers = BuiltinHandlers::default();
    startup_log(started_at, "http.handlers_init.done");
    http::run(port, token, host_port, started_at, &mut handlers)?;
    Ok(())
}

pub fn spawn_detached_http(
    port: u16,
    token: String,
    host_port: Option<u16>,
    started_at: Instant,
) -> Result<(), WorkerError> {
    startup_log(started_at, "detach.start");
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
    if let Some(host_port) = host_port {
        command.arg("--host-port").arg(host_port.to_string());
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000 | 0x0000_0200 | 0x0000_0008);
    }

    let child = command.spawn()?;
    startup_log(
        started_at,
        format!("detach.child_spawned child_pid={}", child.id()),
    );
    Ok(())
}
