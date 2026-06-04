/**
 * Azhura CBT App - Socket State Store (Zustand)
 *
 * Thin reactive wrapper around the Socket.io client in `lib/socket.ts`. Holds
 * connection status and the last supervisor message for the UI to render, and
 * exposes `connect`/`disconnect` that delegate to the underlying client.
 */

import { create } from "zustand";
import { connectSocket, disconnectSocket } from "../lib/socket";

interface SocketState {
  isConnected: boolean;
  lastServerMessage: string | null;
  /**
   * An active supervisor broadcast (#13) to show as a blocking modal; null when
   * none. Toast-variant messages do not set this (they go straight to a toast).
   */
  supervisorModal: string | null;
  /**
   * Monotonic counter bumped whenever the server signals the exam list changed
   * (`exam-list-updated`, #3). The dashboard watches this to trigger a refetch.
   */
  examListVersion: number;
  /** Opens the realtime connection using the given JWT. */
  connect: (token: string) => void;
  /** Closes the realtime connection. */
  disconnect: () => void;
  /** Updates the reactive connection flag (called by socket lifecycle events). */
  setConnected: (connected: boolean) => void;
  /** Stores the most recent supervisor message. */
  setLastMessage: (message: string) => void;
  /** Shows a supervisor broadcast as a blocking modal (#13). */
  setSupervisorModal: (message: string) => void;
  /** Dismisses the active supervisor modal. */
  dismissSupervisorModal: () => void;
  /** Signals that the active-exam list changed server-side (triggers refetch). */
  bumpExamListVersion: () => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  isConnected: false,
  lastServerMessage: null,
  supervisorModal: null,
  examListVersion: 0,

  connect: (token) => {
    connectSocket(token);
  },

  disconnect: () => {
    disconnectSocket();
    set({ isConnected: false });
  },

  setConnected: (connected) => {
    set({ isConnected: connected });
  },

  setLastMessage: (message) => {
    set({ lastServerMessage: message });
  },

  setSupervisorModal: (message) => {
    set({ supervisorModal: message });
  },

  dismissSupervisorModal: () => {
    set({ supervisorModal: null });
  },

  bumpExamListVersion: () => {
    set((state) => ({ examListVersion: state.examListVersion + 1 }));
  },
}));
