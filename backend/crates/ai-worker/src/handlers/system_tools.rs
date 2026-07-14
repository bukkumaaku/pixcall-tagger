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
    Command::new(command)
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .ok()
        .filter(|status| status.success())
        .map(|_| command.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_tool_is_not_reported() {
        assert_eq!(available_on_path("pixcall-tool-that-does-not-exist"), None);
    }
}
