/**
 * Azhura CBT Backend - Live participant roster builder (#7)
 *
 * The roster spans every logged-in student, in two groups:
 * - **Exam-takers** — sourced from active `exam_sessions` (unsubmitted, not yet
 *   expired), the same active-participant rule used for #29. Kept visible even
 *   while disconnected so a supervisor can see a student who dropped mid-exam.
 * - **Dashboard (idle)** — students with a live Redis session registry entry but
 *   no active exam session (logged in, possibly forgot to sign out). Sourced by
 *   enumerating the registry ({@link sessionRegistry.listActive}).
 *
 * Each participant is overlaid with liveness (connected/pending/disconnected)
 * from the registry. `exam` is null for dashboard students; the console groups
 * those under a "Dashboard" section with remote-logout controls.
 */

import type { RosterParticipant, RosterSnapshot } from "@azhura/shared";
import { and, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { sessionRegistry, type ActiveSessionWithUser } from "./session-registry";
import { toLiveness } from "./roster-liveness";

const { exams, users, groups, examSessions } = schema;

/** Student identity + group, shared by exam-taker and dashboard rows. */
interface StudentMeta {
  userId: string;
  nis: string;
  name: string;
  groupName: string | null;
}

/** An active exam-session row joined with the student's identity and exam. */
interface ExamRow extends StudentMeta {
  examId: string;
  examTitle: string;
  startTime: number;
  endTime: number;
  pausedAt: number | null;
}

/**
 * Loads active exam-session rows (DB), optionally narrowed to one user. Flat
 * joins are used because MariaDB rejects Drizzle's relational LATERAL joins.
 */
async function loadExamRows(userId?: string): Promise<ExamRow[]> {
  const conditions = [
    eq(examSessions.submitted, 0),
    // Include paused sessions even if endTime is technically in the past —
    // the timer resumes on reconnect, so they must stay visible on the roster.
    or(gt(examSessions.endTime, Date.now()), isNotNull(examSessions.pausedAt)),
  ];
  if (userId) conditions.push(eq(examSessions.userId, userId));

  const rows = await db
    .select({
      userId: examSessions.userId,
      nis: users.nis,
      name: users.name,
      groupName: groups.name,
      examId: examSessions.examId,
      examTitle: exams.title,
      startTime: examSessions.startTime,
      endTime: examSessions.endTime,
      pausedAt: examSessions.pausedAt,
    })
    .from(examSessions)
    .innerJoin(users, eq(users.id, examSessions.userId))
    .leftJoin(groups, eq(groups.id, users.groupId))
    .innerJoin(exams, eq(exams.id, examSessions.examId))
    .where(and(...conditions));

  return rows.map((r) => ({
    userId: r.userId,
    nis: r.nis,
    name: r.name,
    groupName: r.groupName ?? null,
    examId: r.examId,
    examTitle: r.examTitle,
    startTime: Number(r.startTime),
    endTime: Number(r.endTime),
    pausedAt: r.pausedAt ?? null,
  }));
}

/** Loads identity + group for the given student userIds. */
async function loadStudentMeta(userIds: string[]): Promise<Map<string, StudentMeta>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      userId: users.id,
      nis: users.nis,
      name: users.name,
      groupName: groups.name,
    })
    .from(users)
    .leftJoin(groups, eq(groups.id, users.groupId))
    .where(inArray(users.id, userIds));

  return new Map(
    rows.map((r) => [
      r.userId,
      { userId: r.userId, nis: r.nis, name: r.name, groupName: r.groupName ?? null },
    ])
  );
}

/**
 * Whether a user currently has an active exam session (unsubmitted, unexpired).
 * Drives the disconnect path: an exam-taker who drops stays on the roster as
 * `disconnected`, whereas a dashboard student who drops is removed.
 */
export async function hasActiveExam(userId: string): Promise<boolean> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(examSessions)
    .where(
      and(
        eq(examSessions.userId, userId),
        eq(examSessions.submitted, 0),
        // A paused session counts as active — its timer resumes on reconnect.
        or(gt(examSessions.endTime, Date.now()), isNotNull(examSessions.pausedAt))
      )
    );
  return Number(count) > 0;
}

/** Builds an exam-taker participant from a DB row + its registry liveness. */
function examParticipant(row: ExamRow, registry: ActiveSessionWithUser | null): RosterParticipant {
  return {
    userId: row.userId,
    nis: row.nis,
    name: row.name,
    groupName: row.groupName,
    exam: {
      examId: row.examId,
      examTitle: row.examTitle,
      startTime: row.startTime,
      endTime: row.endTime,
      pausedAt: row.pausedAt,
    },
    ...toLiveness(registry),
  };
}

/** Builds a dashboard (idle) participant from identity + registry liveness. */
function dashboardParticipant(meta: StudentMeta, registry: ActiveSessionWithUser): RosterParticipant {
  return {
    userId: meta.userId,
    nis: meta.nis,
    name: meta.name,
    groupName: meta.groupName,
    exam: null,
    ...toLiveness(registry),
  };
}

/**
 * Builds the full live roster snapshot: active exam-takers (DB) plus dashboard
 * students (registry) that aren't currently in an exam. `serverTime` lets the
 * console correct clock skew when deriving each countdown from `endTime`.
 */
export async function buildRosterSnapshot(): Promise<RosterSnapshot> {
  const [examRows, registryList] = await Promise.all([
    loadExamRows(),
    sessionRegistry.listActive(),
  ]);

  const registryByUser = new Map(registryList.map((e) => [e.userId, e]));
  const examUserIds = new Set(examRows.map((r) => r.userId));

  const examParticipants = examRows.map((row) =>
    examParticipant(row, registryByUser.get(row.userId) ?? null)
  );

  // Dashboard = live registry students who are not currently taking an exam.
  const dashboardUserIds = registryList
    .map((e) => e.userId)
    .filter((id) => !examUserIds.has(id));
  const meta = await loadStudentMeta(dashboardUserIds);
  const dashboardParticipants = dashboardUserIds
    .map((id) => {
      const m = meta.get(id);
      const reg = registryByUser.get(id);
      return m && reg ? dashboardParticipant(m, reg) : null;
    })
    .filter((p): p is RosterParticipant => p !== null);

  return {
    participants: [...examParticipants, ...dashboardParticipants],
    serverTime: Date.now(),
  };
}

/**
 * Lists userIds of students currently idle on the dashboard: a live registry
 * entry but no active exam session. Used by the supervisor "logout all on
 * dashboard" action so it never targets a student who is mid-exam.
 */
export async function listDashboardUserIds(): Promise<string[]> {
  const [examRows, registryList] = await Promise.all([
    loadExamRows(),
    sessionRegistry.listActive(),
  ]);
  const examUserIds = new Set(examRows.map((r) => r.userId));
  return registryList.map((e) => e.userId).filter((id) => !examUserIds.has(id));
}

/**
 * Builds a single participant for a `roster-update` upsert. Resolves the same
 * union as the snapshot for one user:
 * - active exam session → exam-taker entry,
 * - else a live registry entry → dashboard entry,
 * - else null (not on the roster — caller should emit a `remove` instead).
 */
export async function buildRosterParticipant(
  userId: string
): Promise<RosterParticipant | null> {
  const [examRows, registry] = await Promise.all([
    loadExamRows(userId),
    sessionRegistry.getActive(userId),
  ]);

  const regWithUser: ActiveSessionWithUser | null = registry
    ? { ...registry, userId }
    : null;

  if (examRows.length > 0) {
    return examParticipant(examRows[0], regWithUser);
  }
  if (regWithUser) {
    const meta = await loadStudentMeta([userId]);
    const m = meta.get(userId);
    return m ? dashboardParticipant(m, regWithUser) : null;
  }
  return null;
}
