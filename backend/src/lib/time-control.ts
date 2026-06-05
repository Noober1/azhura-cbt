/**
 * Azhura CBT Backend - Live exam time control (#8)
 *
 * Lets a supervisor add or subtract remaining time for a target — one student,
 * one or more groups, or everyone mid-exam — by shifting the affected sessions'
 * `exam_sessions.end_time`. `end_time` stays the single source of truth for when
 * a session ends; the applied adjustment is auditable by deriving it as
 * `end_time − (start_time + duration_minutes·60000)`, so no extra column/table
 * is needed.
 *
 * Targeting reuses the same {@link BroadcastTarget} union as supervisor broadcasts
 * (#13). The DB-touching work is injected via {@link TimeChangeDeps} (defaulting to
 * the real implementations) so the orchestration is unit-testable with fakes —
 * mirroring the pattern in `proctor-actions.ts`.
 */

import { and, eq, gt, inArray } from "drizzle-orm";
import type { BroadcastTarget } from "@azhura/shared";
import { db, schema } from "../db";

const { examSessions, users } = schema;

/** An active session affected by a time change. */
export interface TimeChangeSession {
  sessionId: string;
  userId: string;
  examId: string;
  /** Effective end time *before* the change (ms epoch). */
  endTime: number;
}

/** The result of applying a time change to one session (new effective end). */
export interface TimeChangeResult {
  userId: string;
  examId: string;
  /** New effective end time after the change (ms epoch). */
  endTime: number;
}

/**
 * New effective end time after shifting by `deltaMs`, floored at `now` so a
 * subtraction larger than the remaining time ends the session immediately
 * (remaining → 0) rather than landing in the past. Pure — unit-tested.
 */
export function computeAdjustedEndTime(endTime: number, deltaMs: number, now: number): number {
  return Math.max(now, endTime + deltaMs);
}

/** Collaborators for {@link applyTimeChange}, injectable for tests. */
export interface TimeChangeDeps {
  /** Loads the active (unsubmitted, unexpired) sessions matching the target. */
  loadActiveSessions: (target: BroadcastTarget) => Promise<TimeChangeSession[]>;
  /** Persists the new end times (one transaction). */
  persistEndTimes: (updates: { sessionId: string; endTime: number }[]) => Promise<void>;
  /** Current time (ms epoch); injectable so tests are deterministic. */
  now: () => number;
}

/**
 * Loads active sessions for a target. `all` = every active session; `user` = that
 * user's; `group` = sessions whose student belongs to one of the given groups.
 * Only unsubmitted, not-yet-expired sessions are eligible — a finished or expired
 * exam can't have its time changed.
 */
async function loadActiveSessions(target: BroadcastTarget): Promise<TimeChangeSession[]> {
  const conditions = [eq(examSessions.submitted, 0), gt(examSessions.endTime, Date.now())];
  if (target.type === "user") {
    conditions.push(eq(examSessions.userId, target.userId));
  }

  // A group target needs the student's group, so join users only then.
  const base = db
    .select({
      sessionId: examSessions.id,
      userId: examSessions.userId,
      examId: examSessions.examId,
      endTime: examSessions.endTime,
    })
    .from(examSessions);

  const rows =
    target.type === "group"
      ? await base
          .innerJoin(users, eq(users.id, examSessions.userId))
          .where(and(...conditions, inArray(users.groupId, target.groupIds)))
      : await base.where(and(...conditions));

  return rows.map((r) => ({
    sessionId: r.sessionId,
    userId: r.userId,
    examId: r.examId,
    endTime: Number(r.endTime),
  }));
}

/** Persists new end times for the given sessions inside one transaction. */
async function persistEndTimes(updates: { sessionId: string; endTime: number }[]): Promise<void> {
  if (updates.length === 0) return;
  await db.transaction(async (tx) => {
    for (const u of updates) {
      await tx
        .update(examSessions)
        .set({ endTime: u.endTime })
        .where(eq(examSessions.id, u.sessionId));
    }
  });
}

const defaultDeps: TimeChangeDeps = {
  loadActiveSessions,
  persistEndTimes,
  now: () => Date.now(),
};

/**
 * Applies a time change to every active session matching `target`, shifting each
 * end time by `deltaMs` (clamped at "now"). Returns the affected sessions with
 * their new end times so the caller can push a live `time-change` to each student
 * and refresh the supervisor roster.
 */
export async function applyTimeChange(
  target: BroadcastTarget,
  deltaMs: number,
  deps: TimeChangeDeps = defaultDeps
): Promise<TimeChangeResult[]> {
  const sessions = await deps.loadActiveSessions(target);
  const now = deps.now();

  const updates = sessions.map((s) => ({
    ...s,
    endTime: computeAdjustedEndTime(s.endTime, deltaMs, now),
  }));

  await deps.persistEndTimes(updates.map((u) => ({ sessionId: u.sessionId, endTime: u.endTime })));

  return updates.map((u) => ({ userId: u.userId, examId: u.examId, endTime: u.endTime }));
}
