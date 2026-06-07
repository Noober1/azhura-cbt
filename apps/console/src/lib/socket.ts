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
import { useAuthStore } from "../stores/auth";
import { toast } from "../stores/toast";

const SOCKET_URL = new URL(
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api"
).origin;

/** The active socket connection, or `null` when disconnected. */
let socket: Socket | null = null;

/**
 * Reference count of live consumers. Several hooks share this one socket
 * (`useRoster`, `useLogStream`, `useChatStream`, the global chat launcher); the
 * connection is only torn down once the last of them releases it, so navigating
 * between pages — or mounting the always-on chat launcher alongside a page hook —
 * never disconnects a socket another consumer still depends on.
 */
let refCount = 0;

/**
 * Acquires the shared realtime connection (creating it on first use),
 * authenticated with the given admin/supervisor JWT. Each call must be paired
 * with one {@link disconnectConsoleSocket}.
 *
 * @param token JWT used to authenticate the socket handshake.
 * @returns the active {@link Socket} so callers can attach listeners.
 */
export function connectConsoleSocket(token: string): Socket {
  refCount += 1;
  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: { token },
      autoConnect: true,
      path: "/ws",
    });

    // The backend broadcasts system:reset to ALL connected clients (#79). Any
    // open admin/supervisor tab must evict itself so it doesn't operate against
    // an empty database after the wipe.
    socket.on("system:reset", () => {
      toast.info("Sistem direset oleh admin. Sesi Anda akan berakhir.");
      useAuthStore.getState().logout();
    });
  }
  return socket;
}

/** Releases one consumer's hold; disconnects only when the last one lets go. */
export function disconnectConsoleSocket(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && socket) {
    socket.disconnect();
    socket = null;
  }
}
