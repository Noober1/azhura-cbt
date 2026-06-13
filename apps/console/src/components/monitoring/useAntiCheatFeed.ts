/**
 * Azhura CBT Console — live anti-cheat violation feed (#126).
 *
 * Subscribes to the `anti-cheat-violation` socket event (the server places admin
 * sockets in the `supervisors` room, so no explicit subscribe is needed) and
 * accumulates a bounded, newest-first buffer of violations plus a per-student
 * count. Mirrors `useLogStream`'s socket lifecycle. There is no HTTP backfill:
 * the feed is a live tail, and the `cheat_logs` audit is for post-exam review.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { AntiCheatViolation } from "@azhura/shared";
import { useAuthStore } from "../../stores/auth";
import { connectConsoleSocket, disconnectConsoleSocket } from "../../lib/socket";

/** Max live violations kept in memory before the oldest are dropped. */
const MAX_LIVE = 200;

export interface UseAntiCheatFeedResult {
  /** Live violations, newest first (capped at {@link MAX_LIVE}). */
  violations: AntiCheatViolation[];
  /** Violation count keyed by student id (UUID). */
  byStudent: Map<string, number>;
  /** Whether the console's realtime socket is currently connected. */
  connected: boolean;
  /** Clears the accumulated buffer. */
  clear: () => void;
}

/**
 * @param enabled When false, the hook detaches its listener and stops buffering
 *   (the shared console socket is left to other consumers).
 */
export function useAntiCheatFeed(enabled: boolean): UseAntiCheatFeedResult {
  const token = useAuthStore((s) => s.token);
  const [violations, setViolations] = useState<AntiCheatViolation[]>([]);
  const [connected, setConnected] = useState(false);
  const clearRef = useRef(() => setViolations([]));

  useEffect(() => {
    if (!enabled || !token) return;
    const socket = connectConsoleSocket(token);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onViolation = (v: AntiCheatViolation) =>
      setViolations((prev) => [v, ...prev].slice(0, MAX_LIVE));

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("anti-cheat-violation", onViolation);
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("anti-cheat-violation", onViolation);
      disconnectConsoleSocket();
    };
  }, [enabled, token]);

  const byStudent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of violations) counts.set(v.studentId, (counts.get(v.studentId) ?? 0) + 1);
    return counts;
  }, [violations]);

  return { violations, byStudent, connected, clear: clearRef.current };
}
