/**
 * Azhura CBT App - Anti-Cheat Audit Sink (Zustand)
 *
 * Holds the in-memory log of detected violation events. This store is purely a
 * data sink: the DOM listeners live in `lib/anti-cheat-config.ts` and the
 * window-level (kiosk) events come from Tauri via `lib/kiosk.ts`.
 *
 * The anti-cheat *feature configuration* (enabled, fullscreen, blockShortcuts,
 * …) is owned by `stores/config.ts` (plugin-store, with `VITE_ANTI_CHEAT_*` as
 * the fallback default). This sink reads `enabled` from there so a single source
 * of truth drives both enforcement and auditing — see issue #25/#42.
 *
 * Note: violation events are currently kept in memory only. Production should
 * periodically push `detectedCheats` to a supervisor endpoint (see CLAUDE.md).
 */

import { create } from "zustand";
import type { AntiCheatEvent } from "../types";
import { nanoid } from "nanoid";
import { useConfigStore } from "./config";

interface AntiCheatState {
  detectedCheats: AntiCheatEvent[];
  /** Records a violation event (no-op when anti-cheat is disabled). */
  logCheatEvent: (eventType: AntiCheatEvent["eventType"], details?: string) => void;
  /** Clears the in-memory violation log. */
  clearLogs: () => void;
}

export const useAntiCheatStore = create<AntiCheatState>((set) => ({
  detectedCheats: [],

  logCheatEvent: (eventType, details) => {
    if (!useConfigStore.getState().antiCheat.enabled) return;

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
