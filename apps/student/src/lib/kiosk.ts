/**
 * Azhura CBT App - Kiosk Bridge (L2: Tauri Window)
 *
 * Frontend bridge to the OS-window lockdown layer (epic #24, layer L2). The
 * heavy lifting happens in Rust (`src-tauri/src/lib.rs`): kiosk window flags
 * (fullscreen, always-on-top, no decorations, no minimize/close) and window
 * events (force-refocus, blocked close). This module just invokes those Rust
 * commands and forwards window-level events into the `anti-cheat` audit sink.
 *
 * In web mode (non-Tauri) every function is a no-op so the app keeps working
 * with only the L1 web/DOM layer — same graceful-degradation pattern as
 * `lib/app-store.ts`.
 */

import { useAntiCheatStore } from "../stores/anti-cheat";
import { createLogger } from "./logger";

const log = createLogger("Kiosk");

/** Rust commands exposed via `invoke_handler`. */
const ENTER_KIOSK = "enter_kiosk";
const EXIT_KIOSK = "exit_kiosk";
const EXIT_APP = "exit_app";

/** Events emitted from Rust on window-level violations. */
const EVENT_REFOCUS = "kiosk-refocus";
const EVENT_CLOSE_BLOCKED = "kiosk-close-blocked";

/** Unlisten handle returned by Tauri's `listen`. */
type UnlistenFn = () => void;

/** True when running inside the Tauri webview (vs a plain browser). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Quits the desktop app via the custom `exit_app` Rust command (AppHandle::exit),
 * which isn't gated by the capability system and bypasses the kiosk close guard.
 * No-op on web. Used by the hidden settings panel and the setup wizard so an
 * admin can always leave the app (e.g. for OS-level network diagnosis).
 */
export async function exitApp(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke(EXIT_APP);
}

/** Locks the OS window into kiosk mode. No-op outside Tauri. */
export async function enterKiosk(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke(ENTER_KIOSK);
    log.info("Kiosk mode entered.");
  } catch (error) {
    log.error("Failed to enter kiosk mode", error);
  }
}

/** Releases the window from kiosk mode. No-op outside Tauri. */
export async function exitKiosk(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke(EXIT_KIOSK);
    log.info("Kiosk mode exited.");
  } catch (error) {
    log.error("Failed to exit kiosk mode", error);
  }
}

/**
 * Subscribes to kiosk window events and records them to the audit sink.
 * Returns an unlisten function. Outside Tauri it resolves to a no-op so callers
 * can always `await`/cleanup uniformly.
 */
export async function listenKioskEvents(): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const { logCheatEvent } = useAntiCheatStore.getState();

    const offRefocus = await listen(EVENT_REFOCUS, () => {
      logCheatEvent("force_refocus", "Jendela ujian dipaksa kembali ke depan (kehilangan fokus).");
    });
    const offClose = await listen(EVENT_CLOSE_BLOCKED, () => {
      logCheatEvent("window_close_blocked", "Upaya menutup jendela ujian diblokir.");
    });

    return () => {
      offRefocus();
      offClose();
    };
  } catch (error) {
    log.error("Failed to subscribe to kiosk events", error);
    return () => {};
  }
}
