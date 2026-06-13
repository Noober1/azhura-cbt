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
import { emitAntiCheatViolation } from "../lib/socket";
import { createAntiCheatThrottle } from "../lib/anti-cheat-throttle";

/**
 * Damp bursty outbound emits per event type (#126) — e.g. a flurry of Alt+Tab
 * focus-loss events. The local audit (`detectedCheats`) still records every
 * event; only the *push* to supervisors is throttled. Module-level so it spans
 * the store's lifetime; the server applies its own throttle as a backstop.
 */
const EMIT_MIN_INTERVAL_MS = 1000;
const emitThrottle = createAntiCheatThrottle(EMIT_MIN_INTERVAL_MS);

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

    const timestamp = Date.now();
    const resolvedDetails = details ?? `Cheat detected: ${eventType}`;
    const newEvent: AntiCheatEvent = {
      id: nanoid(),
      eventType,
      timestamp,
      details: resolvedDetails,
    };

    set((state) => ({ detectedCheats: [...state.detectedCheats, newEvent] }));

    // Push to supervisors in real time (#126), throttled per event type so a
    // burst (e.g. repeated Alt+Tab) doesn't flood the socket. The local audit
    // above is unconditional; only the outbound emit is gated. The server is the
    // trust boundary — it re-derives identity/session from the socket itself.
    if (!emitThrottle.allow(eventType, timestamp)) return;
    emitAntiCheatViolation({
      eventType,
      details: resolvedDetails,
      timestamp,
    });
  },

  clearLogs: () => set({ detectedCheats: [] }),
}));
