import { useEffect, useRef, useState } from "react";
import AppRouterWrapper from "./routes";
import { Toaster } from "sonner";
import { SupervisorMessageModal } from "./components/SupervisorMessageModal";
import { PassphraseDialog } from "./components/settings/PassphraseDialog";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { useConfigStore } from "./stores/config";
import { enterKiosk, exitKiosk, listenKioskEvents } from "./lib/kiosk";

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

  // Two-step chord state: null = waiting for step 1, timer = waiting for step 2.
  const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // L2 lockdown is app-wide: when anti-cheat is enabled the OS window is locked
  // into kiosk mode from launch (fullscreen, always-on-top, no close) and stays
  // locked across login/dashboard/exam/result — a mischievous student can't just
  // close the app between sessions. The only way out is the hidden panel's
  // "Keluar dari aplikasi" (which uses destroy() to bypass the close guard).
  const antiCheatEnabled = useConfigStore((s) => s.antiCheat.enabled);

  useEffect(() => {
    if (!antiCheatEnabled) {
      void exitKiosk();
      return;
    }

    void enterKiosk();
    const unlistenPromise = listenKioskEvents();

    return () => {
      void unlistenPromise.then((off) => off());
    };
  }, [antiCheatEnabled]);

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
