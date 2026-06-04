/**
 * Azhura CBT Backend - Roster liveness mapping (#7), pure & I/O-free.
 *
 * Split from `roster.ts` (which imports the DB) so this mapping can be unit
 * tested without a database or Redis connection. Translates a session-registry
 * entry into the roster's `connection` / `lastSeen` fields.
 */

import type { RosterConnection } from "@azhura/shared";
import type { ActiveSession } from "./session-registry";

/** Roster liveness fields derived from a registry entry. */
export interface RosterLiveness {
  connection: RosterConnection;
  lastSeen: number | null;
}

/**
 * Maps a registry entry to its roster liveness fields:
 * - no entry            → `disconnected`, lastSeen null
 * - status "connected"  → `connected`
 * - status "pending"    → `pending` (claimed at login, socket not yet attached)
 * A non-numeric/zero `lastSeen` normalizes to null.
 */
export function toLiveness(active: ActiveSession | null): RosterLiveness {
  if (!active) return { connection: "disconnected", lastSeen: null };
  const parsed = Number(active.lastSeen);
  return {
    connection: active.status === "connected" ? "connected" : "pending",
    lastSeen: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
  };
}
