/**
 * Azhura CBT Backend - Proctor Actions (#11 kick)
 *
 * Server-authoritative kick: a single supervisor action that finalizes a
 * student's exam server-side (so the score is computed even if the client never
 * pressed submit), frees their single-session lock (#5), tells the client to log
 * out, and removes them from the live roster (#7).
 *
 * The orchestration takes its collaborators via an injected {@link KickDeps}
 * (defaulting to the real implementations) so it can be unit-tested with fakes
 * without touching the database, Redis, or a live socket — and without the global
 * module mocking that would leak into other test files.
 */

import { findActiveSession, finalizeSession } from "./exam-scoring";
import { sessionRegistry } from "./session-registry";
import { supervisorActions } from "../socket";
import { notifyRosterPatch } from "./roster-events";
import type { RosterPatch } from "@azhura/shared";

/** Outcome of a kick: `finalized` is true when an in-progress exam was graded. */
export interface KickResult {
  finalized: boolean;
}

/** Collaborators for {@link kickStudent}, injectable for tests. */
export interface KickDeps {
  findActiveSession: (userId: string) => Promise<{ id: string; examId: string } | null>;
  finalizeSession: (session: { id: string; examId: string }) => Promise<unknown>;
  getActiveSession: (userId: string) => Promise<{ sessionId: string } | null>;
  releaseSession: (userId: string, sessionId: string) => Promise<boolean>;
  kickUser: (userId: string, reason: string) => void;
  notifyRosterPatch: (patch: RosterPatch) => void;
}

const defaultDeps: KickDeps = {
  findActiveSession,
  finalizeSession,
  getActiveSession: (userId) => sessionRegistry.getActive(userId),
  releaseSession: (userId, sessionId) => sessionRegistry.release(userId, sessionId),
  kickUser: (userId, reason) => supervisorActions.kickUser(userId, reason),
  notifyRosterPatch,
};

/**
 * Kicks a student out of the system as one atomic proctor action:
 *
 * 1. If the student has an in-progress exam, finalize it server-side (grade the
 *    answers already persisted and mark it submitted) — authoritative even when
 *    the client is offline. A student idle on the dashboard has no active
 *    session, so this step is skipped.
 * 2. Release their active-session registry entry so the account can log in again
 *    per the single-session rules (#5).
 * 3. Emit `kick` to the student's room; the client shows the reason and logs out.
 * 4. Remove them from the supervisor roster (#7).
 *
 * Finalization happens *before* releasing/kicking so a score is never lost to a
 * race with the client tearing down.
 */
export async function kickStudent(
  userId: string,
  reason: string,
  deps: KickDeps = defaultDeps
): Promise<KickResult> {
  const active = await deps.findActiveSession(userId);
  let finalized = false;
  if (active) {
    await deps.finalizeSession(active);
    finalized = true;
  }

  const session = await deps.getActiveSession(userId);
  if (session) {
    await deps.releaseSession(userId, session.sessionId);
  }

  deps.kickUser(userId, reason);
  deps.notifyRosterPatch({ type: "remove", userId });

  return { finalized };
}
