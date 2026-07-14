use std::{
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::Mutex,
};

use serde::Serialize;
use serde_json::Value;
use tauri::{Emitter, Manager, State};

struct WorkerProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

#[derive(Default)]
struct WorkerBridge {
    process: Mutex<Option<WorkerProcess>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimePaths {
    resource_root: String,
}

fn worker_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("backend")
            .join("target")
            .join("debug")
            .join(if cfg!(windows) {
                "ai-worker.exe"
            } else {
                "ai-worker"
            }));
    }

    let directory = if cfg!(target_os = "windows") {
        "win-x64"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "mac-arm64"
    } else {
        return Err("当前平台没有打包 ai-worker".to_string());
    };
    Ok(app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?
        .join("bin")
        .join(directory)
        .join(if cfg!(windows) {
            "ai-worker.exe"
        } else {
            "ai-worker"
        }))
}

fn start_worker(app: &tauri::AppHandle) -> Result<WorkerProcess, String> {
    let path = worker_path(app)?;
    if !path.is_file() {
        return Err(format!("找不到 ai-worker: {}", path.display()));
    }

    let mut child = Command::new(&path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .creation_flags(if cfg!(windows) { 0x0800_0000 } else { 0 })
        .spawn()
        .map_err(|error| format!("无法启动 {}: {error}", path.display()))?;
    let stdin = child.stdin.take().ok_or("ai-worker stdin 不可用")?;
    let stdout = child.stdout.take().ok_or("ai-worker stdout 不可用")?;
    Ok(WorkerProcess {
        child,
        stdin,
        stdout: BufReader::new(stdout),
    })
}

#[cfg(not(windows))]
trait CommandCreationFlags {
    fn creation_flags(&mut self, _flags: u32) -> &mut Self;
}

#[cfg(not(windows))]
impl CommandCreationFlags for Command {
    fn creation_flags(&mut self, _flags: u32) -> &mut Self {
        self
    }
}

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[tauri::command]
fn worker_request(
    app: tauri::AppHandle,
    state: State<'_, WorkerBridge>,
    request: Value,
) -> Result<Value, String> {
    let request_id = request
        .get("requestId")
        .and_then(Value::as_str)
        .ok_or("worker 请求缺少 requestId")?
        .to_string();
    let mut guard = state.process.lock().map_err(|error| error.to_string())?;
    if guard.is_none() {
        *guard = Some(start_worker(&app)?);
    }

    let result = (|| {
        let worker = guard.as_mut().ok_or("ai-worker 未启动")?;
        serde_json::to_writer(&mut worker.stdin, &request).map_err(|error| error.to_string())?;
        worker
            .stdin
            .write_all(b"\n")
            .map_err(|error| error.to_string())?;
        worker.stdin.flush().map_err(|error| error.to_string())?;

        loop {
            let mut line = String::new();
            let bytes = worker
                .stdout
                .read_line(&mut line)
                .map_err(|error| error.to_string())?;
            if bytes == 0 {
                return Err("ai-worker 已意外退出".to_string());
            }
            let message: Value = serde_json::from_str(&line)
                .map_err(|error| format!("ai-worker 返回了无效 JSON: {error}"))?;
            if message.get("requestId").and_then(Value::as_str) != Some(&request_id) {
                continue;
            }
            if message.get("type").and_then(Value::as_str) == Some("progress") {
                app.emit("worker-progress", &message)
                    .map_err(|error| error.to_string())?;
                continue;
            }
            return Ok(message);
        }
    })();

    if result.is_err() {
        if let Some(mut worker) = guard.take() {
            let _ = worker.child.kill();
        }
    }
    result
}

#[tauri::command]
fn worker_dispose(state: State<'_, WorkerBridge>) -> Result<(), String> {
    let mut guard = state.process.lock().map_err(|error| error.to_string())?;
    if let Some(mut worker) = guard.take() {
        worker.child.kill().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn runtime_paths(app: tauri::AppHandle) -> Result<RuntimePaths, String> {
    let resource_root = if cfg!(debug_assertions) {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .canonicalize()
            .map_err(|error| error.to_string())?
    } else {
        app.path()
            .resource_dir()
            .map_err(|error| error.to_string())?
    };
    Ok(RuntimePaths {
        resource_root: resource_root.to_string_lossy().into_owned(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WorkerBridge::default())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            worker_request,
            worker_dispose,
            runtime_paths
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
