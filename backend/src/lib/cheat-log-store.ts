/**
 * Azhura CBT Backend - Anti-Cheat Violation Store (#126)
 *
 * Two responsibilities, kept out of `socket.ts` so the realtime handler stays
 * thin and the core logic is unit-testable without a live socket:
 *
 * 1. {@link buildViolationPayload} — pure mapping of an authenticated socket's
 *    identity (`socket.data`) plus a raw client event into the enriched
 *    {@link AntiCheatViolation} broadcast to supervisors. Server-authoritative:
 *    identity/session come from the JWT-derived socket data, never the client.
 * 2. {@link insertCheatLog} — fire-and-forget audit insert into `cheat_logs`,
 *    mirroring `log-store.ts` (`insertLog`): never awaited on the hot path and
 *    never throws, so a DB hiccup can't break the socket handler.
 * 3. {@link createBurstThrottle} — a tiny per-key min-interval gate to damp
 *    bursty violations (e.g. Alt+Tab spam) before they flood the socket / DB.
 */

import { randomUUID } from "crypto";
import { db, schema } from "../db";
import type { AntiCheatEvent, AntiCheatViolation } from "@azhura/shared";

// NB: access `schema.cheatLogs` lazily inside the insert rather than
// destructuring it at module top — this module may be imported while `../db`
// is still evaluating, so a top-level read could hit a temporal dead zone.

/** The set of accepted client event types, mirroring {@link AntiCheatEvent}. */
const KNOWN_EVENT_TYPES = new Set<AntiCheatEvent["eventType"]>([
  "focus_loss",
  "fullscreen_exit",
  "shortcut_attempt",
  "multi_monitor",
  "clipboard_blocked",
  "force_refocus",
  "window_close_blocked",
  "os_shortcut_blocked",
]);

/** Hard cap on persisted/forwarded detail length, defensive against bloat. */
const MAX_DETAILS = 512;

/**
 * The slice of `socket.data` the violation payload needs. A narrow structural
 * type (not the full Socket.io `Socket["data"]`) keeps this pure and trivially
 * testable.
 */
export interface ViolationSocketData {
  userId: string;
  nis: string;
  /** Set during chat setup; may be absent → empty string in the payload. */
  name?: string;
  /** Active-session jti bound at handshake; "" when unbound. */
  sessionId?: string;
}

/** The raw, untrusted inbound event from a student client. */
export interface RawViolationEvent {
  eventType?: unknown;
  details?: unknown;
  timestamp?: unknown;
}

/**
 * Narrows an unknown inbound `eventType` to a known {@link AntiCheatEvent}
 * literal, or `null` if unrecognized (so the caller can ignore it).
 */
export function parseEventType(value: unknown): AntiCheatEvent["eventType"] | null {
  return typeof value === "string" && KNOWN_EVENT_TYPES.has(value as AntiCheatEvent["eventType"])
    ? (value as AntiCheatEvent["eventType"])
    : null;
}

/**
 * Maps an authenticated socket's identity + a *validated* raw client event into
 * the enriched {@link AntiCheatViolation}. Pure: the caller must have already
 * validated `eventType` via {@link parseEventType}.
 *
 * @param data    Identity slice of `socket.data` (server-authoritative).
 * @param event   Raw client event; only `details`/`timestamp`/`examId` are read.
 * @param eventType The pre-validated event type literal.
 */
export function buildViolationPayload(
  data: ViolationSocketData,
  event: RawViolationEvent,
  eventType: AntiCheatEvent["eventType"]
): AntiCheatViolation {
  const details =
    typeof event.details === "string" && event.details.length > 0
      ? event.details.slice(0, MAX_DETAILS)
      : undefined;
  const timestamp =
    typeof event.timestamp === "number" && Number.isFinite(event.timestamp)
      ? event.timestamp
      : Date.now();

  return {
    studentId: data.userId,
    nis: data.nis,
    name: data.name ?? "",
    sessionId: data.sessionId ?? "",
    // Not trusted from the client; the supervisor feed attributes by session.
    // (A server-side sessionId→exam lookup could populate this later if needed.)
    examId: null,
    eventType,
    details,
    timestamp,
  };
}

/**
 * Fire-and-forget audit insert into `cheat_logs`. Never awaited on the socket
 * path and never throws — a failed insert is silently dropped (the live
 * supervisor broadcast remains the primary signal). Mirrors `insertLog`.
 *
 * Skipped when `sessionId` is empty: the column is a non-null FK to
 * `exam_sessions`, so a violation from a student not bound to a session has no
 * row to attach to (it is still broadcast live, just not persisted).
 */
export function insertCheatLog(v: {
  sessionId: string;
  eventType: string;
  details?: string | null;
  occurredAt: number;
}): void {
  if (!v.sessionId) return;
  void db
    .insert(schema.cheatLogs)
    .values({
      id: randomUUID(),
      sessionId: v.sessionId,
      eventType: v.eventType.slice(0, 50),
      details: v.details ? v.details.slice(0, MAX_DETAILS) : null,
      occurredAt: v.occurredAt,
    })
    .catch(() => {
      // Intentionally swallowed — the live supervisor feed is authoritative.
    });
}

/** A per-key min-interval gate. {@link createBurstThrottle} builds one. */
export interface BurstThrottle {
  /**
   * Returns true if the key is allowed to fire at `now` (and records it),
   * false if it fired within the last `minIntervalMs`.
   */
  allow: (key: string, now: number) => boolean;
  /** Forgets a key's last-fire timestamp (call on disconnect to bound memory). */
  reset: (key: string) => void;
  /** Number of keys currently tracked. */
  size: () => number;
}

/**
 * Creates a {@link BurstThrottle}: a key may fire at most once per
 * `minIntervalMs`. Used to damp bursty violations (e.g. repeated Alt+Tab focus
 * loss) per `(socketId, eventType)` before they hit the socket fan-out and DB.
 *
 * @param minIntervalMs Minimum gap between accepted fires for the same key.
 */
export function createBurstThrottle(minIntervalMs: number): BurstThrottle {
  const lastFire = new Map<string, number>();
  return {
    allow: (key, now) => {
      const prev = lastFire.get(key);
      if (prev !== undefined && now - prev < minIntervalMs) return false;
      lastFire.set(key, now);
      return true;
    },
    reset: (key) => {
      // Clear every entry for this socket: keys are `${socketId}:${eventType}`.
      if (lastFire.has(key)) {
        lastFire.delete(key);
        return;
      }
      const prefix = `${key}:`;
      for (const k of lastFire.keys()) {
        if (k.startsWith(prefix)) lastFire.delete(k);
      }
    },
    size: () => lastFire.size,
  };
}
