use protocol::{MinimizePluginWindowRequest, MinimizePluginWindowResult};

#[cfg(target_os = "macos")]
use std::process::Command;

use super::HandlerResult;

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM},
    UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextLengthW, GetWindowTextW, IsWindowVisible, SW_MINIMIZE,
        ShowWindowAsync,
    },
};

pub fn minimize(_: MinimizePluginWindowRequest) -> HandlerResult<MinimizePluginWindowResult> {
    Ok(MinimizePluginWindowResult {
        minimized: minimize_tagger_window(),
    })
}

#[cfg(windows)]
fn minimize_tagger_window() -> bool {
    let mut found = false;
    unsafe {
        EnumWindows(Some(find_and_minimize), (&mut found as *mut bool) as LPARAM);
    }
    found
}

#[cfg(windows)]
unsafe extern "system" fn find_and_minimize(window: HWND, state: LPARAM) -> i32 {
    if unsafe { IsWindowVisible(window) } == 0 {
        return 1;
    }
    let length = unsafe { GetWindowTextLengthW(window) };
    if length <= 0 {
        return 1;
    }
    let mut title = vec![0u16; length as usize + 1];
    let copied = unsafe { GetWindowTextW(window, title.as_mut_ptr(), title.len() as i32) };
    if copied <= 0 {
        return 1;
    }
    let title = String::from_utf16_lossy(&title[..copied as usize]);
    if title.contains("AI 自动标签") {
        unsafe { ShowWindowAsync(window, SW_MINIMIZE) };
        unsafe { *(state as *mut bool) = true };
        return 0;
    }
    1
}

#[cfg(not(windows))]
fn minimize_tagger_window() -> bool {
    #[cfg(target_os = "macos")]
    {
        return Command::new("osascript")
            .args([
                "-e",
                "tell application \"System Events\" to tell (first application process whose frontmost is true) to set value of attribute \"AXMinimized\" of front window to true",
            ])
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
    }
    #[cfg(not(target_os = "macos"))]
    false
}
