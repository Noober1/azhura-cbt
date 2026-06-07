/**
 * Azhura CBT Console — realtime log tail hook (#18).
 *
 * Subscribes to the `log-entry` socket event (the server places admin sockets in
 * the `supervisors` room, so no explicit subscribe is needed) and accumulates a
 * bounded, newest-first buffer of live entries. The log *history* comes from the
 * DB-backed `GET /admin/logs`; this hook only supplies the live tail.
 */

import { useEffect, useRef, useState } from "react";
import type { LogBroadcast } from "@azhura/shared";
import { useAuthStore } from "../../stores/auth";
import { connectConsoleSocket, disconnectConsoleSocket } from "../../lib/socket";

/** Max live entries kept in memory before the oldest are dropped. */
const MAX_LIVE = 200;

export interface UseLogStreamResult {
  /** Live entries, newest first (capped at {@link MAX_LIVE}). */
  live: LogBroadcast[];
  /** Whether the console's realtime socket is currently connected. */
  connected: boolean;
  /** Clears the accumulated live buffer. */
  clear: () => void;
}

/**
 * @param enabled When false, the hook detaches its listener and stops buffering
 *   (the socket itself is shared and left to other consumers).
 */
export function useLogStream(enabled: boolean): UseLogStreamResult {
  const token = useAuthStore((s) => s.token);
  const [live, setLive] = useState<LogBroadcast[]>([]);
  const [connected, setConnected] = useState(false);
  const clearRef = useRef(() => setLive([]));

  useEffect(() => {
    if (!enabled || !token) return;
    const socket = connectConsoleSocket(token);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onEntry = (entry: LogBroadcast) =>
      setLive((prev) => [entry, ...prev].slice(0, MAX_LIVE));

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("log-entry", onEntry);
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("log-entry", onEntry);
      disconnectConsoleSocket();
    };
  }, [enabled, token]);

  return { live, connected, clear: clearRef.current };
}
