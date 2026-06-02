/**
 * Azhura CBT App - Anti-Cheat Store (Zustand)
 *
 * Holds the anti-cheat feature configuration (sourced from `VITE_ANTI_CHEAT_*`
 * env vars) and the in-memory log of detected violation events. The actual DOM
 * listeners live in `lib/anti-cheat-config.ts`; this store is their data sink.
 *
 * Note: violation events are currently kept in memory only. Production should
 * periodically push `detectedCheats` to a supervisor endpoint (see CLAUDE.md).
 */

import { create } from "zustand";
import { AntiCheatConfig, AntiCheatEvent } from "../types";
import { nanoid } from "nanoid";

interface AntiCheatState {
  config: AntiCheatConfig;
  detectedCheats: AntiCheatEvent[];
  /** Loads feature flags from `VITE_ANTI_CHEAT_*` env vars into `config`. */
  initializeConfig: () => void;
  /** Enables/disables a single anti-cheat feature at runtime. */
  toggleFeature: (feature: keyof AntiCheatConfig, enabled: boolean) => void;
  /** Records a violation event (no-op when anti-cheat is disabled). */
  logCheatEvent: (eventType: AntiCheatEvent["eventType"], details?: string) => void;
  /** Clears the in-memory violation log. */
  clearLogs: () => void;
}

export const useAntiCheatStore = create<AntiCheatState>((set, get) => ({
  config: {
    enabled: false,
    fullscreen: false,
    blockShortcuts: false,
    detectFocusLoss: false,
    detectMultiMonitor: false,
  },
  detectedCheats: [],

  initializeConfig: () => {
    const masterEnabled = import.meta.env.VITE_ANTI_CHEAT_ENABLED === "true";
    set({
      config: {
        enabled: masterEnabled,
        fullscreen: masterEnabled && import.meta.env.VITE_ANTI_CHEAT_FULLSCREEN === "true",
        blockShortcuts: masterEnabled && import.meta.env.VITE_ANTI_CHEAT_BLOCK_SHORTCUTS === "true",
        detectFocusLoss: masterEnabled && import.meta.env.VITE_ANTI_CHEAT_DETECT_FOCUS_LOSS === "true",
        detectMultiMonitor: masterEnabled && import.meta.env.VITE_ANTI_CHEAT_DETECT_MULTI_MONITOR === "true",
      },
    });
  },

  toggleFeature: (feature, enabled) => {
    set((state) => ({ config: { ...state.config, [feature]: enabled } }));
  },

  logCheatEvent: (eventType, details) => {
    if (!get().config.enabled) return;

    const newEvent: AntiCheatEvent = {
      id: nanoid(),
      eventType,
      timestamp: Date.now(),
      details: details ?? `Cheat detected: ${eventType}`,
    };

    set((state) => ({ detectedCheats: [...state.detectedCheats, newEvent] }));
  },

  clearLogs: () => set({ detectedCheats: [] }),
}));
