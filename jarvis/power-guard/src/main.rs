#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

#[cfg(not(target_os = "windows"))]
fn main() {
    eprintln!("jarvis-power-guard is supported only on Windows.");
}

#[cfg(target_os = "windows")]
mod win_guard {
    use std::ffi::OsStr;
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;
    use std::process::Command;
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW,
        ShutdownBlockReasonCreate, ShutdownBlockReasonDestroy, TranslateMessage, CS_HREDRAW,
        CS_VREDRAW, MSG, WM_DESTROY, WM_ENDSESSION, WM_QUERYENDSESSION, WNDCLASSW,
    };

    const CLASS_NAME: &str = "JarvisPowerGuardWindow";
    const BLOCK_REASON: &str = "Jarvis zabezpiecza zdalny dostęp i przełącza shutdown na hibernację.";

    fn to_wide(value: &str) -> Vec<u16> {
        OsStr::new(value).encode_wide().chain(once(0)).collect()
    }

    unsafe extern "system" fn window_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_QUERYENDSESSION => {
                let reason = to_wide(BLOCK_REASON);
                ShutdownBlockReasonCreate(hwnd, reason.as_ptr());
                let _ = Command::new("shutdown").args(["/h"]).spawn();
                ShutdownBlockReasonDestroy(hwnd);
                0
            }
            WM_ENDSESSION => 0,
            WM_DESTROY => 0,
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    pub fn run() {
        unsafe {
            let class_name = to_wide(CLASS_NAME);
            let instance = GetModuleHandleW(std::ptr::null());
            let wnd = WNDCLASSW {
                style: CS_HREDRAW | CS_VREDRAW,
                lpfnWndProc: Some(window_proc),
                hInstance: instance,
                lpszClassName: class_name.as_ptr(),
                ..std::mem::zeroed()
            };

            RegisterClassW(&wnd);
            CreateWindowExW(
                0,
                class_name.as_ptr(),
                class_name.as_ptr(),
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                instance,
                std::ptr::null(),
            );

            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, 0, 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn main() {
    if std::env::var("JARVIS_POWER_GUARD_DISABLED")
        .map(|value| matches!(value.trim().to_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false)
    {
        return;
    }
    win_guard::run();
}
