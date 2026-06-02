/**
 * Tauri CBT App - Anti-Cheat Controller
 * Configures listeners for browser/system events to prevent student cheating
 * (detecting screen splits, tabbing out, and blocking specific shortcuts).
 */

import { useAntiCheatStore } from "../stores/anti-cheat";
import { toast } from "sonner";
import { createLogger } from "./logger";

const log = createLogger("AntiCheat");

/**
 * Attaches anti-cheat event listeners (focus loss, fullscreen exit, blocked
 * shortcuts, and right-click) to the global window/document. Each handler is a
 * no-op unless the corresponding feature is enabled in the anti-cheat config.
 *
 * @returns A cleanup function that removes all registered listeners. Call it on
 *          unmount to avoid duplicate listeners / leaks.
 */
export const startAntiCheatMonitoring = (): (() => void) => {
  const store = useAntiCheatStore.getState();
  
  // 1. Monitor Focus Loss (Alt-Tab detection)
  const handleFocusLoss = () => {
    const config = useAntiCheatStore.getState().config;
    if (!config.enabled || !config.detectFocusLoss) return;

    store.logCheatEvent(
      "focus_loss",
      "Siswa meninggalkan aplikasi ujian (Alt+Tab / kehilangan fokus jendela)."
    );
    
    toast.error("Peringatan: Jangan meninggalkan jendela ujian! Pelanggaran telah dicatat.", {
      duration: 5000,
    });
  };

  // 2. Monitor Fullscreen Transitions
  const handleFullscreenChange = () => {
    const config = useAntiCheatStore.getState().config;
    if (!config.enabled || !config.fullscreen) return;

    if (!document.fullscreenElement) {
      store.logCheatEvent(
        "fullscreen_exit",
        "Siswa keluar dari mode Layar Penuh (Fullscreen)."
      );
      toast.warning("Ujian harus diselesaikan dalam mode Layar Penuh!", {
        action: {
          label: "Layar Penuh",
          onClick: () => enterFullscreen(),
        },
        duration: 10000,
      });
    }
  };

  // 3. Block Critical Keyboard Shortcuts
  const handleKeyDown = (e: KeyboardEvent) => {
    const config = useAntiCheatStore.getState().config;
    if (!config.enabled || !config.blockShortcuts) return;

    let shouldBlock = false;
    let shortcutName = "";

    // F12 (Developer Tools)
    if (e.key === "F12") {
      shouldBlock = true;
      shortcutName = "F12 (DevTools)";
    }
    // Ctrl+Shift+I (Developer Tools)
    else if (e.ctrlKey && e.shiftKey && e.key?.toLowerCase() === "i") {
      shouldBlock = true;
      shortcutName = "Ctrl+Shift+I (DevTools)";
    }
    // Ctrl+R or F5 (Page Refresh)
    else if ((e.ctrlKey && e.key?.toLowerCase() === "r") || e.key === "F5") {
      shouldBlock = true;
      shortcutName = "Refresh Halaman";
    }
    // Alt+Tab (Usually intercepted by OS, but we catch window focus loss. Some combinations can be checked)
    else if (e.altKey && e.key === "Tab") {
      shouldBlock = true;
      shortcutName = "Alt+Tab";
    }

    if (shouldBlock) {
      e.preventDefault();
      e.stopPropagation();
      store.logCheatEvent(
        "shortcut_attempt",
        `Siswa mencoba pintasan keyboard terlarang: ${shortcutName}`
      );
      toast.error(`Pintasan terlarang diblokir: ${shortcutName}`);
    }
  };

  // 4. Block Right-Click Context Menu
  const handleContextMenu = (e: MouseEvent) => {
    const config = useAntiCheatStore.getState().config;
    if (!config.enabled || !config.blockShortcuts) return;

    e.preventDefault();
    toast.error("Klik kanan tidak diizinkan selama ujian!");
  };

  // Register listeners
  if (typeof window !== "undefined") {
    window.addEventListener("blur", handleFocusLoss);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("contextmenu", handleContextMenu);
  }

  log.info("Global monitoring listeners registered.");

  // Return clean-up function
  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("blur", handleFocusLoss);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("contextmenu", handleContextMenu);
    }
    log.info("Global monitoring listeners cleaned up.");
  };
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
