/**
 * Azhura CBT App - Anti-Cheat Controller (L1: Web/DOM)
 *
 * The top layer of the Exam Lockdown Engine (epic #24, layer L1). Runs inside
 * the webview and can only *detect* — by the time focus is lost we are already
 * late — so it is also the cross-platform fallback for macOS/Linux. Stronger
 * window-level (L2) and OS-level (L3) prevention live in `src-tauri`.
 *
 * Feature flags are read from `useConfigStore().antiCheat` (plugin-store, with
 * `VITE_ANTI_CHEAT_*` as the fallback default), so the hidden settings panel
 * (#42) drives enforcement. Violations are recorded to the `anti-cheat` audit
 * sink (`stores/anti-cheat.ts`).
 */

import type { AntiCheatEvent } from "../types";
import { useAntiCheatStore } from "../stores/anti-cheat";
import { useConfigStore } from "../stores/config";
import { useExamStore } from "../stores/exam";
import { toast } from "sonner";
import { createLogger } from "./logger";

const log = createLogger("AntiCheat");

/** Collapse rapid blur + visibilitychange pairs into a single focus-loss log. */
const FOCUS_LOSS_DEDUPE_MS = 1000;

/** Reads the current anti-cheat feature flags (single source of truth). */
const getConfig = () => useConfigStore.getState().antiCheat;

/** Records a violation to the audit sink. */
const logEvent = (eventType: AntiCheatEvent["eventType"], details: string): void =>
  useAntiCheatStore.getState().logCheatEvent(eventType, details);

/**
 * Attaches anti-cheat event listeners (focus loss, fullscreen exit, blocked
 * shortcuts, right-click, clipboard/selection) to the global window/document.
 * Each handler is a no-op unless the corresponding feature is enabled.
 *
 * @returns A cleanup function that removes all registered listeners. Call it on
 *          unmount to avoid duplicate listeners / leaks.
 */
export const startAntiCheatMonitoring = (): (() => void) => {
  let lastFocusLossAt = 0;

  // 1. Focus loss — both window blur and tab/visibility change (Alt+Tab,
  //    minimize, switching desktops). Deduped so one action logs once.
  const handleFocusLoss = () => {
    const config = getConfig();
    if (!config.enabled || !config.detectFocusLoss) return;

    const now = Date.now();
    if (now - lastFocusLossAt < FOCUS_LOSS_DEDUPE_MS) return;
    lastFocusLossAt = now;

    logEvent(
      "focus_loss",
      "Siswa meninggalkan aplikasi ujian (Alt+Tab / minimize / kehilangan fokus)."
    );
    toast.error("Peringatan: Jangan meninggalkan jendela ujian! Pelanggaran telah dicatat.", {
      duration: 5000,
    });
  };

  const handleVisibilityChange = () => {
    if (document.hidden) handleFocusLoss();
  };

  // 2. Fullscreen transitions — suppress the expected exit that happens while
  //    the exam is being finalized (manual submit, timer expiry, force-finish
  //    all funnel through finalizeExam → `finalizing`).
  const handleFullscreenChange = () => {
    const config = getConfig();
    if (!config.enabled || !config.fullscreen) return;
    if (document.fullscreenElement) return;
    if (useExamStore.getState().finalizing) return;

    logEvent("fullscreen_exit", "Siswa keluar dari mode Layar Penuh (Fullscreen).");
    toast.warning("Ujian harus diselesaikan dalam mode Layar Penuh!", {
      action: { label: "Layar Penuh", onClick: () => enterFullscreen() },
      duration: 10000,
    });
  };

  // 3. Block critical keyboard shortcuts. Alt+Tab is logged but cannot truly be
  //    prevented at the DOM level — that is L3's job (Windows low-level hook).
  const handleKeyDown = (e: KeyboardEvent) => {
    const config = getConfig();
    if (!config.enabled || !config.blockShortcuts) return;

    const key = e.key?.toLowerCase();
    const blocked = matchBlockedShortcut(e, key);
    if (!blocked) return;

    // Alt+Tab can't be swallowed here; record it without claiming we blocked it.
    if (blocked === "Alt+Tab") {
      logEvent("shortcut_attempt", "Siswa mencoba berpindah jendela (Alt+Tab).");
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    logEvent("shortcut_attempt", `Siswa mencoba pintasan keyboard terlarang: ${blocked}`);
    toast.error(`Pintasan terlarang diblokir: ${blocked}`);
  };

  // 4. Block right-click context menu.
  const handleContextMenu = (e: MouseEvent) => {
    const config = getConfig();
    if (!config.enabled || !config.blockShortcuts) return;
    e.preventDefault();
    toast.error("Klik kanan tidak diizinkan selama ujian!");
  };

  // 5. Block clipboard / selection / drag to prevent copying questions out or
  //    pasting prepared answers in.
  const handleClipboard = (e: Event) => {
    const config = getConfig();
    if (!config.enabled || !config.blockShortcuts) return;
    e.preventDefault();
    logEvent("clipboard_blocked", `Aksi clipboard/seleksi diblokir: ${e.type}`);
  };

  if (typeof window !== "undefined") {
    window.addEventListener("blur", handleFocusLoss);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("contextmenu", handleContextMenu);
    for (const type of CLIPBOARD_EVENTS) {
      window.addEventListener(type, handleClipboard);
    }
  }

  log.info("Global monitoring listeners registered.");

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("blur", handleFocusLoss);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("contextmenu", handleContextMenu);
      for (const type of CLIPBOARD_EVENTS) {
        window.removeEventListener(type, handleClipboard);
      }
    }
    log.info("Global monitoring listeners cleaned up.");
  };
};

/** Clipboard/selection/drag events blocked during an exam. */
const CLIPBOARD_EVENTS = ["copy", "paste", "cut", "selectstart", "dragstart"] as const;

/** Minimal keyboard-event shape consumed by {@link matchBlockedShortcut}. */
export interface ShortcutLike {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}

/**
 * Returns a human-readable label for a blocked shortcut, or `null` when the
 * keystroke is allowed. Covers DevTools, refresh, print, save, and view-source.
 * Exported for unit testing (pure, no DOM).
 */
export function matchBlockedShortcut(e: ShortcutLike, key: string | undefined): string | null {
  if (e.key === "F12") return "F12 (DevTools)";
  if (e.key === "F5") return "Refresh Halaman";
  if (e.altKey && e.key === "Tab") return "Alt+Tab";

  if (e.ctrlKey && e.shiftKey) {
    if (key === "i") return "Ctrl+Shift+I (DevTools)";
    if (key === "j") return "Ctrl+Shift+J (Console)";
    if (key === "c") return "Ctrl+Shift+C (Inspect)";
  }

  if (e.ctrlKey && !e.shiftKey && !e.altKey) {
    if (key === "r") return "Refresh Halaman";
    if (key === "p") return "Ctrl+P (Print)";
    if (key === "s") return "Ctrl+S (Save)";
    if (key === "u") return "Ctrl+U (View Source)";
  }

  return null;
}

/** Vendor-prefixed window-management surface for multi-monitor detection. */
interface ScreenDetailsLike {
  screens: unknown[];
}
type ScreenWithExtended = Screen & { isExtended?: boolean };
type WindowWithScreenDetails = Window & {
  getScreenDetails?: () => Promise<ScreenDetailsLike>;
};

/**
 * Detects whether more than one display is attached and records a violation if
 * so. Uses the Window Management API (`getScreenDetails`) when available — which
 * requires a secure context and user permission and may reject — and falls back
 * to the `screen.isExtended` heuristic. No-op unless the feature is enabled.
 */
export const detectMultiMonitor = async (): Promise<void> => {
  const config = getConfig();
  if (!config.enabled || !config.detectMultiMonitor) return;

  try {
    const win = window as WindowWithScreenDetails;
    let multiple = false;

    if (typeof win.getScreenDetails === "function") {
      const details = await win.getScreenDetails();
      multiple = Array.isArray(details.screens) && details.screens.length > 1;
    } else {
      multiple = (window.screen as ScreenWithExtended).isExtended === true;
    }

    if (multiple) {
      logEvent("multi_monitor", "Terdeteksi lebih dari satu monitor/layar.");
      toast.warning("Terdeteksi lebih dari satu layar. Gunakan satu monitor selama ujian.");
    }
  } catch (error) {
    log.warn("Multi-monitor detection unavailable or denied", { error });
  }
};

/** Vendor-prefixed fullscreen methods for older WebView/browser engines. */
type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

/**
 * Attempts to enter Fullscreen mode safely.
 *
 * Fullscreen APIs are promise-based and commonly reject (e.g. when not invoked
 * from a user gesture), so both synchronous throws and async rejections are
 * caught and logged rather than surfacing as unhandled errors.
 */
export const enterFullscreen = (): void => {
  const docEl = document.documentElement as FullscreenCapableElement;
  try {
    if (document.fullscreenElement) return;

    const request =
      docEl.requestFullscreen?.bind(docEl) ??
      docEl.webkitRequestFullscreen?.bind(docEl) ??
      docEl.msRequestFullscreen?.bind(docEl);

    if (!request) {
      log.warn("Fullscreen API not supported in this environment.");
      return;
    }

    Promise.resolve(request()).catch((error) => {
      log.error("Failed to enter fullscreen (request rejected)", error);
    });
  } catch (error) {
    log.error("Failed to enter fullscreen", error);
  }
};

/**
 * Attempts to exit Fullscreen mode safely, swallowing the common rejection
 * that occurs when the document is not currently in fullscreen.
 */
export const exitFullscreen = (): void => {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      Promise.resolve(document.exitFullscreen()).catch((error) => {
        log.error("Failed to exit fullscreen (request rejected)", error);
      });
    }
  } catch (error) {
    log.error("Failed to exit fullscreen", error);
  }
};
