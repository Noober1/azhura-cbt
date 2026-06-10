import { useEffect, useRef, useState } from "react";
import AppRouterWrapper from "./routes";
import { Toaster } from "sonner";
import { SupervisorMessageModal } from "./components/SupervisorMessageModal";
import { PassphraseDialog } from "./components/settings/PassphraseDialog";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { useConfigStore } from "./stores/config";
import { enterKiosk, exitKiosk, listenKioskEvents } from "./lib/kiosk";
import {
  enableKbdLock,
  disableKbdLock,
  listenKbdLockEvents,
} from "./lib/kbd-lock";
import { startInputHardening } from "./lib/anti-cheat-config";
import { isResolutionSufficient } from "./lib/screen";
import { ResolutionGuard } from "./components/setup/ResolutionGuard";

/**
 * Key chord that opens the hidden settings panel: Ctrl+Shift+O, then Ctrl+Shift+S (within 2 s).
 * Only active in Tauri builds — invisible to web users.
 */
const CHORD_STEP1 = (e: KeyboardEvent) =>
  e.ctrlKey && e.shiftKey && !e.altKey && e.key === "O";
const CHORD_STEP2 = (e: KeyboardEvent) =>
  e.ctrlKey && e.shiftKey && !e.altKey && e.key === "S";
const CHORD_TIMEOUT_MS = 2000;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function App() {
  const [passphraseOpen, setPassphraseOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Minimum-resolution gate (#48): read the monitor size once at mount. Below
  // 1280×720 the exam layout can clip, so we block the whole app with a
  // non-bypassable warning instead of rendering the router. Per #48 there is no
  // re-check on resize. `window.screen` reports logical pixels in web and Tauri.
  const [screen] = useState(() => ({
    width: typeof window !== "undefined" ? window.screen?.width ?? 0 : 0,
    height: typeof window !== "undefined" ? window.screen?.height ?? 0 : 0,
  }));
  const screenOk = isResolutionSufficient(screen.width, screen.height);

  // Two-step chord state: null = waiting for step 1, timer = waiting for step 2.
  const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // L2 lockdown is app-wide: when anti-cheat is enabled the OS window is locked
  // into kiosk mode from launch (fullscreen, always-on-top, no close) and stays
  // locked across login/dashboard/exam/result — a mischievous student can't just
  // close the app between sessions. The only way out is the hidden panel's
  // "Keluar dari aplikasi" (which uses destroy() to bypass the close guard).
  const antiCheatEnabled = useConfigStore((s) => s.antiCheat.enabled);
  const blockOsKeyboard = useConfigStore((s) => s.antiCheat.blockOsKeyboard);

  useEffect(() => {
    // Don't lock into kiosk while the resolution guard is blocking the app —
    // the student needs to reach OS display settings to fix their monitor.
    if (!screenOk) return;
    if (!antiCheatEnabled) {
      void exitKiosk();
      return;
    }

    void enterKiosk();
    const unlistenPromise = listenKioskEvents();
    // Right-click / shortcut / clipboard prevention is active app-wide while
    // anti-cheat is on — not just on the exam screen.
    const stopHardening = startInputHardening();

    return () => {
      void unlistenPromise.then((off) => off());
      stopHardening();
    };
  }, [antiCheatEnabled, screenOk]);

  // L3 lockdown (#27) is app-wide too, mirroring the L2 kiosk above: the OS
  // keyboard hook stays installed across login/dashboard/exam/result so
  // Alt+Tab/Win don't come back the moment the student submits. It is only
  // released when the toggle is switched off in the hidden settings panel or
  // on app exit (RunEvent::Exit in src-tauri handles the latter). Like the
  // kiosk, it stays off while the resolution guard is blocking the app, so the
  // student can still reach OS display settings. Setup is sequenced
  // (subscribe → enable) so no blocked combo is missed, and a cancellation
  // flag keeps cleanup correct when it fires mid-setup (StrictMode
  // double-invoke, config change in flight).
  useEffect(() => {
    // While the resolution guard blocks the app the hook was never installed,
    // so just bail (mirrors the kiosk effect) — no teardown call needed.
    if (!screenOk) return;
    if (!antiCheatEnabled || !blockOsKeyboard) {
      void disableKbdLock();
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      const off = await listenKbdLockEvents();
      if (cancelled) {
        off();
        return;
      }
      unlisten = off;

      await enableKbdLock();
      if (cancelled) {
        // Cleanup ran while enable was in flight — undo it.
        void disableKbdLock();
      }
    };
    void setup();

    return () => {
      cancelled = true;
      unlisten?.();
      // No disableKbdLock() here: the hook must survive route changes. The
      // disable paths are the guard branch above (toggle off) and app exit.
    };
  }, [antiCheatEnabled, blockOsKeyboard, screenOk]);

  useEffect(() => {
    if (!isTauri()) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (CHORD_STEP1(e)) {
        if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
        chordTimerRef.current = setTimeout(() => {
          chordTimerRef.current = null;
        }, CHORD_TIMEOUT_MS);
        return;
      }

      if (chordTimerRef.current && CHORD_STEP2(e)) {
        clearTimeout(chordTimerRef.current);
        chordTimerRef.current = null;
        setPassphraseOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
    };
  }, []);

  // Resolution gate (#48): block everything with a non-bypassable warning when
  // the monitor is too small. Rendered after all hooks so hook order is stable.
  if (!screenOk) {
    return <ResolutionGuard width={screen.width} height={screen.height} />;
  }

  return (
    <>
      {/* HashRouter Navigation structure */}
      <AppRouterWrapper />

      {/* Toast notifications container */}
      <Toaster
        position="top-right"
        expand={false}
        richColors
        theme="light"
        closeButton
      />

      {/* Supervisor broadcast modal (#13) */}
      <SupervisorMessageModal />

      {/* Hidden settings entry — passphrase gate (#42) */}
      <PassphraseDialog
        open={passphraseOpen}
        onVerified={() => {
          setPassphraseOpen(false);
          setSettingsOpen(true);
        }}
        onClose={() => setPassphraseOpen(false)}
      />

      {/* Hidden settings panel (#42) */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}

export default App;
