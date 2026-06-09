/**
 * Azhura CBT Console — live participant roster hook (#7).
 *
 * Backfills the roster via HTTP once, then stays live by applying `roster-update`
 * patches over the supervisor socket. Remaining time is derived locally from each
 * participant's `endTime` (corrected for client/server clock skew) and a 1s tick,
 * so the server never has to stream per-second countdowns.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RosterParticipant, RosterPatch } from "@azhura/shared";
import { useAuthStore } from "../../stores/auth";
import { monitoringApi } from "../../lib/monitoring-api";
import { connectConsoleSocket, disconnectConsoleSocket } from "../../lib/socket";
import { getErrorMessage } from "../../lib/errors";

export interface UseRosterResult {
  participants: RosterParticipant[];
  loading: boolean;
  error: string | null;
  /** Whether the console's own realtime socket is currently connected. */
  wsConnected: boolean;
  /** Re-runs the HTTP backfill (e.g. after a transient error). */
  reload: () => void;
  /**
   * Remaining time for a participant, in ms, floored at 0.
   * When `pausedAt` is set the countdown is frozen at the pause moment.
   */
  remainingMs: (endTime: number, pausedAt: number | null) => number;
}

/** Applies one roster patch to the participant map immutably. */
function applyPatch(
  prev: Map<string, RosterParticipant>,
  patch: RosterPatch
): Map<string, RosterParticipant> {
  const next = new Map(prev);
  switch (patch.type) {
    case "upsert":
      next.set(patch.participant.userId, patch.participant);
      break;
    case "remove":
      next.delete(patch.userId);
      break;
    case "connection": {
      const existing = next.get(patch.userId);
      // A connection patch for someone not in the roster is ignored: an upsert
      // (or the next backfill) is the authoritative way to add a participant.
      if (existing) {
        next.set(patch.userId, {
          ...existing,
          connection: patch.connection,
          lastSeen: patch.lastSeen,
        });
      }
      break;
    }
  }
  return next;
}

export function useRoster(): UseRosterResult {
  const token = useAuthStore((s) => s.token);
  const [participants, setParticipants] = useState<Map<string, RosterParticipant>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [, setTick] = useState(0);

  /** serverTime - Date.now() at snapshot, used to correct countdown skew. */
  const skewRef = useRef(0);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // HTTP backfill — runs on mount and whenever a reload is requested.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    monitoringApi
      .getRoster()
      .then((snapshot) => {
        if (cancelled) return;
        skewRef.current = snapshot.serverTime - Date.now();
        setParticipants(
          new Map(snapshot.participants.map((p) => [p.userId, p]))
        );
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Gagal memuat daftar peserta."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  // Live patches over the supervisor socket.
  useEffect(() => {
    if (!token) return;
    const socket = connectConsoleSocket(token);

    const onConnect = () => setWsConnected(true);
    const onDisconnect = () => setWsConnected(false);
    const onPatch = (patch: RosterPatch) =>
      setParticipants((prev) => applyPatch(prev, patch));

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("roster-update", onPatch);
    setWsConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("roster-update", onPatch);
      disconnectConsoleSocket();
    };
  }, [token]);

  // 1-second tick so derived countdowns re-render without per-second WS traffic.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = useCallback(
    (endTime: number, pausedAt: number | null) =>
      pausedAt !== null
        ? Math.max(0, endTime - pausedAt)
        : Math.max(0, endTime - (Date.now() + skewRef.current)),
    []
  );

  return {
    participants: Array.from(participants.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
    loading,
    error,
    wsConnected,
    reload,
    remainingMs,
  };
}
