/**
 * Azhura CBT Console — WebSocket (Socket.io) Client
 *
 * Realtime link to the proctoring server for supervisor/admin dashboards. The
 * server places this connection in the `supervisors` room (by JWT role), so it
 * receives `roster-update` patches (#7) and `log-entry` events without any
 * client-side subscribe call. Mirrors the student client's singleton lifecycle
 * (apps/student/src/lib/socket.ts).
 *
 * The active socket is a module-level singleton; callers attach their own event
 * listeners on the returned instance and detach them on cleanup.
 */

import { io, Socket } from "socket.io-client";

const SOCKET_URL = new URL(
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api"
).origin;

/** The active socket connection, or `null` when disconnected. */
let socket: Socket | null = null;

/**
 * Opens the realtime connection (idempotent — returns the existing socket if one
 * is already open) authenticated with the given admin/supervisor JWT.
 *
 * @param token JWT used to authenticate the socket handshake.
 * @returns the active {@link Socket} so callers can attach listeners.
 */
export function connectConsoleSocket(token: string): Socket {
  if (socket) return socket;
  socket = io(SOCKET_URL, {
    auth: { token },
    autoConnect: true,
    path: "/ws",
  });
  return socket;
}

/** Closes the realtime connection and releases the singleton. */
export function disconnectConsoleSocket(): void {
  if (!socket) return;
  socket.disconnect();
  socket = null;
}
