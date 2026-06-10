// L3 — OS low-level keyboard hook (epic #24, issue #27). Windows-only.
//
// Installs a `SetWindowsHookEx(WH_KEYBOARD_LL)` hook that swallows forbidden
// system key combos (Alt+Tab, Alt+Esc, Win, Ctrl+Esc, PrintScreen) before the
// OS acts on them — true prevention, unlike the L2 refocus mitigation. The hook
// is app-wide like the L2 kiosk: the frontend (App.tsx) calls `enable_kbd_lock`
// while anti-cheat + `blockOsKeyboard` are on and `disable_kbd_lock` only when
// that toggle is switched off (see `src/lib/kbd-lock.ts`); each swallowed
// keydown is
// emitted to the frontend as `kbd-lock-blocked` for the anti-cheat audit sink.
//
// Known limitation (by design of Windows, NOT a bug): Ctrl+Alt+Del is the
// Secure Attention Sequence, handled in the kernel — no user-mode hook can
// intercept it. Disabling it requires OS policy (Assigned Access / Group
// Policy) on the exam machines, outside this app's scope. If the process is
// killed, Windows releases the hook automatically.
//
// On non-Windows targets both commands compile to no-ops so the same frontend
// code path works everywhere (mirroring the web no-op in `kbd-lock.ts`).

/// Event emitted to the frontend on each swallowed keydown.
/// Mirrored in `src/lib/kbd-lock.ts`. Payload: `{ combo: string }`.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
const EVENT_KBD_BLOCKED: &str = "kbd-lock-blocked";

/// Decides whether a key event must be swallowed while the lock is active.
/// Returns the human-readable combo name (used in the audit event) or `None`
/// to let the key through. Takes plain integers (no winapi types) so it
/// compiles and unit-tests on any platform.
///
/// The Win keys are swallowed unconditionally: that also neutralizes Win+D,
/// Win+Tab, Win+E, Win+R, … because the chord can never form. Plain Ctrl
/// combos (Ctrl+C, Ctrl+R, F12, …) are deliberately NOT handled here — DOM
/// shortcut blocking is the L1 layer's job (`anti-cheat-config.ts`).
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) fn should_swallow(vk: u32, flags: u32, ctrl_down: bool) -> Option<&'static str> {
    // Win32 virtual-key codes / flag bits.
    const VK_TAB: u32 = 0x09;
    const VK_ESCAPE: u32 = 0x1B;
    const VK_SNAPSHOT: u32 = 0x2C; // PrintScreen
    const VK_LWIN: u32 = 0x5B;
    const VK_RWIN: u32 = 0x5C;
    const LLKHF_ALTDOWN: u32 = 0x20;

    let alt_down = flags & LLKHF_ALTDOWN != 0;
    match vk {
        VK_LWIN | VK_RWIN => Some("Win"),
        VK_TAB if alt_down => Some("Alt+Tab"),
        VK_ESCAPE if alt_down => Some("Alt+Esc"),
        VK_ESCAPE if ctrl_down => Some("Ctrl+Esc"),
        VK_SNAPSHOT => Some("PrintScreen"),
        _ => None,
    }
}

/// Installs the low-level keyboard hook (no-op off Windows). Idempotent.
#[tauri::command]
pub fn enable_kbd_lock(app: tauri::AppHandle) -> Result<(), String> {
    platform::enable(&app)
}

/// Removes the hook and restores normal key handling (no-op off Windows).
/// Idempotent.
#[tauri::command]
pub fn disable_kbd_lock() -> Result<(), String> {
    platform::disable();
    Ok(())
}

/// Releases the hook on app-exit paths (`exit_app` command, `RunEvent::Exit`).
/// Windows would drop the hook on process death anyway; this is hygiene so the
/// keyboard is restored before teardown, not after.
pub fn shutdown() {
    platform::disable();
}

#[cfg(target_os = "windows")]
mod platform {
    #![deny(unsafe_op_in_unsafe_fn)]

    use super::{should_swallow, EVENT_KBD_BLOCKED};
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
    use std::sync::mpsc::{channel, sync_channel, Sender, SyncSender};
    use std::sync::OnceLock;
    use tauri::{AppHandle, Emitter};
    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL};
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, PeekMessageW, PostThreadMessageW, SetWindowsHookExW,
        UnhookWindowsHookEx, HC_ACTION, KBDLLHOOKSTRUCT, MSG, PM_NOREMOVE, WH_KEYBOARD_LL,
        WM_KEYDOWN, WM_QUIT, WM_SYSKEYDOWN,
    };

    /// Bound on queued-but-not-yet-emitted audit events. Keystrokes are
    /// human-rate; if the emitter ever stalls, overflow is dropped (audit is
    /// best-effort) rather than growing memory or blocking the hook callback.
    const EMIT_QUEUE_CAP: usize = 256;

    /// Gate read by the hook callback. Also makes enable/disable idempotent
    /// and lets keys flow through in the brief window between `disable()` and
    /// the hook thread actually unhooking.
    static ACTIVE: AtomicBool = AtomicBool::new(false);
    /// Thread id of the hook thread — the target for the `WM_QUIT` that stops
    /// its message pump. 0 = no hook thread running.
    static HOOK_THREAD_ID: AtomicU32 = AtomicU32::new(0);
    /// Channel into the emitter thread (spawned once, on first enable). The
    /// hook callback must stay fast, so it only `try_send`s here; the emitter
    /// thread does the actual Tauri event emission.
    static EMIT_TX: OnceLock<SyncSender<&'static str>> = OnceLock::new();
    static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

    #[derive(Clone, serde::Serialize)]
    struct KbdBlockedPayload {
        combo: &'static str,
    }

    pub fn enable(app: &AppHandle) -> Result<(), String> {
        if ACTIVE.swap(true, Ordering::SeqCst) {
            return Ok(()); // already locked
        }
        let _ = APP_HANDLE.set(app.clone());
        EMIT_TX.get_or_init(|| {
            let (tx, rx) = sync_channel::<&'static str>(EMIT_QUEUE_CAP);
            std::thread::spawn(move || {
                for combo in rx {
                    if let Some(app) = APP_HANDLE.get() {
                        let _ = app.emit(EVENT_KBD_BLOCKED, KbdBlockedPayload { combo });
                    }
                }
            });
            tx
        });

        // Block until the hook is installed (or failed) so HOOK_THREAD_ID is
        // guaranteed set before enable() returns — no disable/enable race.
        let (ready_tx, ready_rx) = channel::<Result<(), String>>();
        std::thread::spawn(move || hook_thread_main(ready_tx));
        match ready_rx.recv() {
            Ok(Ok(())) => Ok(()),
            Ok(Err(e)) => {
                ACTIVE.store(false, Ordering::SeqCst);
                Err(e)
            }
            Err(_) => {
                ACTIVE.store(false, Ordering::SeqCst);
                Err("kbd-lock hook thread exited before reporting readiness".into())
            }
        }
    }

    pub fn disable() {
        if !ACTIVE.swap(false, Ordering::SeqCst) {
            return; // not locked
        }
        let tid = HOOK_THREAD_ID.swap(0, Ordering::SeqCst);
        if tid != 0 {
            // SAFETY: no pointer arguments; posting to a dead thread merely
            // returns an error, which we ignore.
            let _ = unsafe { PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0)) };
        }
    }

    /// Dedicated hook thread: WH_KEYBOARD_LL callbacks are delivered through a
    /// message pump on the installing thread, so it must live for the whole
    /// lock and run `GetMessageW` until `disable()` posts `WM_QUIT`.
    fn hook_thread_main(ready: Sender<Result<(), String>>) {
        // SAFETY: `ll_hook_proc` is a valid HOOKPROC for the lifetime of the
        // hook (it lives in the binary); WH_KEYBOARD_LL allows a null module
        // handle and thread id 0 (global hook in this process).
        let hook = match unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(ll_hook_proc), None, 0) } {
            Ok(h) => h,
            Err(e) => {
                let _ = ready.send(Err(format!("SetWindowsHookExW failed: {e}")));
                return;
            }
        };

        // Force creation of this thread's message queue BEFORE advertising the
        // thread id: queues are created lazily, and a PostThreadMessageW (from
        // a fast enable→disable sequence) that lands before the queue exists
        // would be lost — leaving the hook installed forever.
        let mut peek = MSG::default();
        // SAFETY: `peek` is a valid, writable MSG; PM_NOREMOVE only inspects.
        let _ = unsafe { PeekMessageW(&mut peek, None, 0, 0, PM_NOREMOVE) };

        // SAFETY: no preconditions; returns the calling thread's id.
        HOOK_THREAD_ID.store(unsafe { GetCurrentThreadId() }, Ordering::SeqCst);
        let _ = ready.send(Ok(()));

        let mut msg = MSG::default();
        // `.0 > 0` (not `as_bool`): GetMessageW returns 0 on WM_QUIT and -1 on
        // error — both must end the pump.
        // SAFETY: `msg` is a valid, writable MSG for every iteration.
        while unsafe { GetMessageW(&mut msg, None, 0, 0) }.0 > 0 {}

        // SAFETY: `hook` is the live handle returned by SetWindowsHookExW
        // above, unhooked exactly once, on the same thread that installed it.
        let _ = unsafe { UnhookWindowsHookEx(hook) };
    }

    /// The WH_KEYBOARD_LL callback. MUST stay fast — Windows silently removes
    /// hooks that exceed the LowLevelHooksTimeout budget (~300 ms default).
    /// Work here is capped at: one atomic read, one `GetAsyncKeyState`, a pure
    /// match, and a non-blocking channel send. Returning `LRESULT(1)` swallows
    /// the event (both keydown and keyup, so no orphan keyups leak through);
    /// the audit event is sent on keydown only to avoid double entries.
    unsafe extern "system" fn ll_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        // Relaxed is enough: a momentarily stale read during the enable/disable
        // transition only lets one keystroke through (or swallows one extra)
        // while the hook is being torn down anyway — benign for this use.
        if code == HC_ACTION as i32 && ACTIVE.load(Ordering::Relaxed) {
            // SAFETY: for WH_KEYBOARD_LL with code == HC_ACTION, lparam points
            // to a KBDLLHOOKSTRUCT valid for the duration of this call (Win32
            // contract); we only read from it.
            let kb = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
            // SAFETY: no preconditions; reads the async key state snapshot.
            let ctrl_down = unsafe { GetAsyncKeyState(VK_CONTROL.0 as i32) } < 0;

            if let Some(combo) = should_swallow(kb.vkCode, kb.flags.0, ctrl_down) {
                let msg = wparam.0 as u32;
                if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
                    if let Some(tx) = EMIT_TX.get() {
                        // try_send: never block the hook callback; drop on overflow.
                        let _ = tx.try_send(combo);
                    }
                }
                return LRESULT(1);
            }
        }
        // SAFETY: forwards the original, unmodified arguments to the next hook
        // in the chain; a null hook handle is allowed since NT 4.
        unsafe { CallNextHookEx(None, code, wparam, lparam) }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    /// L3 is Windows-only; elsewhere the lock is a no-op (L1+L2 still apply).
    pub fn enable(_app: &tauri::AppHandle) -> Result<(), String> {
        Ok(())
    }

    pub fn disable() {}
}

#[cfg(test)]
mod tests {
    use super::should_swallow;

    const NO_FLAGS: u32 = 0;
    const ALT_DOWN: u32 = 0x20; // LLKHF_ALTDOWN

    #[test]
    fn swallows_alt_tab() {
        assert_eq!(should_swallow(0x09, ALT_DOWN, false), Some("Alt+Tab"));
    }

    #[test]
    fn passes_plain_tab() {
        assert_eq!(should_swallow(0x09, NO_FLAGS, false), None);
    }

    #[test]
    fn swallows_left_and_right_win_regardless_of_modifiers() {
        // Unconditional swallow also covers Win+D/Tab/E/R — the chord never forms.
        assert_eq!(should_swallow(0x5B, NO_FLAGS, false), Some("Win"));
        assert_eq!(should_swallow(0x5C, NO_FLAGS, false), Some("Win"));
        assert_eq!(should_swallow(0x5B, ALT_DOWN, true), Some("Win"));
    }

    #[test]
    fn swallows_alt_esc() {
        assert_eq!(should_swallow(0x1B, ALT_DOWN, false), Some("Alt+Esc"));
    }

    #[test]
    fn swallows_ctrl_esc() {
        assert_eq!(should_swallow(0x1B, NO_FLAGS, true), Some("Ctrl+Esc"));
    }

    #[test]
    fn passes_plain_esc() {
        assert_eq!(should_swallow(0x1B, NO_FLAGS, false), None);
    }

    #[test]
    fn swallows_printscreen() {
        assert_eq!(should_swallow(0x2C, NO_FLAGS, false), Some("PrintScreen"));
    }

    #[test]
    fn passes_plain_letters() {
        assert_eq!(should_swallow(0x41, NO_FLAGS, false), None); // 'A'
    }

    #[test]
    fn passes_ctrl_letter_combos() {
        // Ctrl+C etc. are L1's job (DOM blocking) — the OS hook must not eat them.
        assert_eq!(should_swallow(0x43, NO_FLAGS, true), None); // Ctrl+'C'
    }
}
