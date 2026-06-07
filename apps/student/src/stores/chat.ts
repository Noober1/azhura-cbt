/**
 * Azhura CBT App - Public Chat State Store (Zustand) (#17)
 *
 * Reactive state for the dashboard chat room: whether the feature is enabled,
 * the message buffer, the present-members list (for @mention autocomplete), and
 * the local mute state. The socket layer (`lib/socket.ts`) drives every setter
 * from server events; components read this store and call `sendChat` to post.
 */

import { create } from "zustand";
import type { ChatMessage, ChatPresenceMember } from "@azhura/shared";

/** Max messages retained in memory; older ones drop off the top. */
const MAX_MESSAGES = 200;

interface ChatState {
  /** Whether the chat feature is globally enabled (admin setting #17). */
  enabled: boolean;
  /** Messages in render order (oldest→newest). */
  messages: ChatMessage[];
  /** Students currently in the room — @mention candidates. */
  presence: ChatPresenceMember[];
  /** Epoch-ms the local user's mute lifts, or null when not muted. */
  mutedUntil: number | null;
  /** Reason shown while muted. */
  muteReason: string | null;
  /** True when the mute was applied by a supervisor (vs anti-spam auto-mute). */
  muteManual: boolean;

  setEnabled: (enabled: boolean) => void;
  setHistory: (messages: ChatMessage[]) => void;
  pushMessage: (message: ChatMessage) => void;
  setPresence: (members: ChatPresenceMember[]) => void;
  setMuted: (mutedUntil: number, reason: string, manual: boolean) => void;
  clearMute: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  enabled: false,
  messages: [],
  presence: [],
  mutedUntil: null,
  muteReason: null,
  muteManual: false,

  setEnabled: (enabled) =>
    // Turning chat off clears the buffer so stale messages don't flash back if
    // it is re-enabled before fresh history arrives.
    set(enabled ? { enabled } : { enabled, messages: [], presence: [] }),

  setHistory: (messages) => set({ messages: messages.slice(-MAX_MESSAGES) }),

  pushMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message].slice(-MAX_MESSAGES),
    })),

  setPresence: (members) => set({ presence: members }),

  setMuted: (mutedUntil, reason, manual) =>
    set({ mutedUntil, muteReason: reason, muteManual: manual }),

  clearMute: () => set({ mutedUntil: null, muteReason: null, muteManual: false }),
}));
