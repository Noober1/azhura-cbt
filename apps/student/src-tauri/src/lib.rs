// Azhura CBT — Tauri shell.
//
// Hosts the L2 layer of the Exam Lockdown Engine (epic #24): an OS-window kiosk
// mode driven from the frontend via `enter_kiosk` / `exit_kiosk`, plus a window
// event handler that forces the window back to the foreground on focus loss and
// blocks manual close while an exam is active. Window-level violations are
// emitted to the frontend (`kiosk-refocus`, `kiosk-close-blocked`) for auditing.

use std::sync::Mutex;
use tauri::{Emitter, Manager, WebviewWindow, WindowEvent};

/// Event names mirrored in `src/lib/kiosk.ts`.
const EVENT_REFOCUS: &str = "kiosk-refocus";
const EVENT_CLOSE_BLOCKED: &str = "kiosk-close-blocked";

/// Whether an exam is currently active. While `true`, the window event handler
/// enforces refocus + close prevention. Managed as Tauri state.
#[derive(Default)]
struct ExamLockState {
    active: Mutex<bool>,
}

impl ExamLockState {
    fn is_active(&self) -> bool {
        self.active.lock().map(|a| *a).unwrap_or(false)
    }

    fn set_active(&self, value: bool) {
        if let Ok(mut a) = self.active.lock() {
            *a = value;
        }
    }
}

/// Applies (or reverts) the kiosk window flags. `on = true` locks the window:
/// fullscreen, always-on-top, no decorations, and not resizable/maximizable/
/// minimizable, hidden from the taskbar. Cross-platform; the aggressive
/// always-on-top behavior is most effective on Windows and degrades gracefully
/// elsewhere.
fn apply_kiosk(window: &WebviewWindow, on: bool) -> tauri::Result<()> {
    window.set_fullscreen(on)?;
    window.set_always_on_top(on)?;
    window.set_decorations(!on)?;
    window.set_resizable(!on)?;
    window.set_maximizable(!on)?;
    window.set_minimizable(!on)?;
    window.set_skip_taskbar(on)?;
    if on {
        window.set_focus()?;
    }
    Ok(())
}

/// Locks the window into kiosk mode and marks the exam active.
#[tauri::command]
fn enter_kiosk(window: WebviewWindow, state: tauri::State<ExamLockState>) -> Result<(), String> {
    apply_kiosk(&window, true).map_err(|e| e.to_string())?;
    state.set_active(true);
    Ok(())
}

/// Releases kiosk mode and marks the exam inactive.
#[tauri::command]
fn exit_kiosk(window: WebviewWindow, state: tauri::State<ExamLockState>) -> Result<(), String> {
    state.set_active(false);
    apply_kiosk(&window, false).map_err(|e| e.to_string())?;
    Ok(())
}

/// Quits the application. Invoked from the hidden settings panel's "Keluar dari
/// aplikasi" button. Goes through `AppHandle::exit` (not a window close) so the
/// kiosk close guard does not block it — this is the sanctioned admin exit.
#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(ExamLockState::default())
        .invoke_handler(tauri::generate_handler![enter_kiosk, exit_kiosk, exit_app])
        .on_window_event(|window, event| match event {
            // Window lost focus (Alt+Tab, click-away): yank it back to the
            // foreground and report the violation. True prevention is L3.
            WindowEvent::Focused(false) => {
                if window.state::<ExamLockState>().is_active() {
                    let _ = window.set_focus();
                    let _ = window.set_always_on_top(true);
                    let _ = window.emit(EVENT_REFOCUS, ());
                }
            }
            // Block manual window close during an exam; only an official submit
            // (which calls exit_kiosk first) may close the window.
            WindowEvent::CloseRequested { api, .. } => {
                if window.state::<ExamLockState>().is_active() {
                    api.prevent_close();
                    let _ = window.emit(EVENT_CLOSE_BLOCKED, ());
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
