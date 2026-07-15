use std::process::{Command, Stdio};

use protocol::{SystemToolsRequest, SystemToolsResult};

use super::HandlerResult;

pub fn handle(_: SystemToolsRequest) -> HandlerResult<SystemToolsResult> {
    Ok(SystemToolsResult {
        ffmpeg_path: available_on_path("ffmpeg"),
        ffprobe_path: available_on_path("ffprobe"),
    })
}

fn available_on_path(command: &str) -> Option<String> {
    let mut process = Command::new(command);
    hide_console(&mut process);
    process
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .ok()
        .filter(|status| status.success())
        .map(|_| command.to_string())
}

#[cfg(windows)]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_console(_: &mut Command) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_tool_is_not_reported() {
        assert_eq!(available_on_path("pixcall-tool-that-does-not-exist"), None);
    }
}
