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
  /** Opens the realtime connection using the given JWT. */
  connect: (token: string) => void;
  /** Closes the realtime connection. */
  disconnect: () => void;
  /** Updates the reactive connection flag (called by socket lifecycle events). */
  setConnected: (connected: boolean) => void;
  /** Stores the most recent supervisor message. */
  setLastMessage: (message: string) => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  isConnected: false,
  lastServerMessage: null,

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
}));
