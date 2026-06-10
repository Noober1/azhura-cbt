/**
 * Azhura CBT App - Keyboard Lock Bridge (L3: OS Low-Level Hook)
 *
 * Frontend bridge to the OS-keyboard lockdown layer (epic #24, layer L3,
 * issue #27). The heavy lifting happens in Rust (`src-tauri/src/kbd_lock.rs`):
 * a `WH_KEYBOARD_LL` hook that swallows Alt+Tab, Alt+Esc, Win, Ctrl+Esc and
 * PrintScreen before the OS acts on them. This module just invokes those Rust
 * commands and forwards each blocked attempt into the `anti-cheat` audit sink.
 *
 * Unlike the app-wide L2 kiosk (`kiosk.ts`), the keyboard lock is exam-scoped:
 * ExamLayout enables it when the exam mounts and disables it on unmount.
 *
 * The hook is Windows-only — on macOS/Linux desktop the Rust commands are
 * no-ops, and in web mode (non-Tauri) every function here is a no-op, so the
 * app keeps working with the L1+L2 layers. Note: Ctrl+Alt+Del (Secure
 * Attention Sequence) can never be blocked from user-space; that is an OS
 * policy matter on the exam machines.
 */

import { useAntiCheatStore } from "../stores/anti-cheat";
import { isTauri } from "./kiosk";
import { createLogger } from "./logger";

const log = createLogger("KbdLock");

/** Rust commands exposed via `invoke_handler`. */
const ENABLE_KBD_LOCK = "enable_kbd_lock";
const DISABLE_KBD_LOCK = "disable_kbd_lock";

/** Event emitted from Rust on each swallowed key combo. */
const EVENT_KBD_BLOCKED = "kbd-lock-blocked";

/** Payload of `kbd-lock-blocked` (see `KbdBlockedPayload` in kbd_lock.rs). */
interface KbdBlockedPayload {
  combo: string;
}

/** Unlisten handle returned by Tauri's `listen`. */
type UnlistenFn = () => void;

/** Installs the OS low-level keyboard hook. No-op outside Tauri. */
export async function enableKbdLock(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke(ENABLE_KBD_LOCK);
    log.info("OS keyboard lock enabled.");
  } catch (error) {
    log.error("Failed to enable OS keyboard lock", error);
  }
}

/** Removes the hook and restores normal key handling. No-op outside Tauri. */
export async function disableKbdLock(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke(DISABLE_KBD_LOCK);
    log.info("OS keyboard lock disabled.");
  } catch (error) {
    log.error("Failed to disable OS keyboard lock", error);
  }
}

/**
 * Subscribes to blocked-combo events and records them to the audit sink.
 * Returns an unlisten function. Outside Tauri it resolves to a no-op so
 * callers can always `await`/cleanup uniformly.
 */
export async function listenKbdLockEvents(): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const { logCheatEvent } = useAntiCheatStore.getState();

    return await listen<KbdBlockedPayload>(EVENT_KBD_BLOCKED, (event) => {
      logCheatEvent(
        "os_shortcut_blocked",
        `Kombinasi tombol sistem diblokir: ${event.payload.combo}.`,
      );
    });
  } catch (error) {
    log.error("Failed to subscribe to keyboard lock events", error);
    return () => {};
  }
}
