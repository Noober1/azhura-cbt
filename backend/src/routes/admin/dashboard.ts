/**
 * Azhura CBT Backend — Admin Dashboard Route (#78)
 *
 * Provides a realtime system overview for admin users:
 * - `GET /admin/dashboard` — initial snapshot (totalStudents, groups, exams,
 *   onlineStudents, session breakdown, and min/median/max score per exam).
 * - `setDashboardBroadcaster` / `notifyDashboardStats` — broadcaster seam
 *   (consistent with roster/log/chat pattern) that routes and socket.ts use to
 *   push a fresh `dashboard:stats` event to all connected admins/supervisors.
 */

import { Elysia } from "elysia";
import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "../../db";
import { authPlugin } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { createLogger } from "../../lib/logger";
import { gradeQuestion } from "../../lib/exam-scoring";
import type { DashboardSnapshot, ExamScoreSummary } from "@azhura/shared";

const log = createLogger("AdminDashboard");

const { users, groups, exams, examGroups, examSessions, questions, answers } = schema;

// ── Broadcaster seam ─────────────────────────────────────────────────────────

let broadcaster: ((stats: DashboardSnapshot) => void) | null = null;
/** Returns the number of student sockets currently connected. Wired by socket.ts. */
let getOnlineStudentCount: () => number = () => 0;

/** Called from `socket.ts` once the Socket.io server is ready. */
export function setDashboardBroadcaster(fn: (stats: DashboardSnapshot) => void): void {
  broadcaster = fn;
}

/**
 * Called from `socket.ts` to wire in a live socket count. Using the actual
 * Socket.io server avoids the Redis session-registry grace-period lag: the
 * count drops to zero the moment the socket physically disconnects.
 */
export function setOnlineStudentCountGetter(fn: () => number): void {
  getOnlineStudentCount = fn;
}

// ── Stats computation ─────────────────────────────────────────────────────────

function calcMedian(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

async function computeStats(adminName: string): Promise<DashboardSnapshot> {
  const now = Date.now();

  const [
    studentsResult,
    groupsResult,
    examsResult,
    onlineCount,
    sessionRows,
    scoreRows,
    examTitles,
    eligibleRows,
    sessionUserIds,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, "student")),
    db.select({ count: sql<number>`count(*)` }).from(groups),
    db.select({ count: sql<number>`count(*)` }).from(exams),

    // Online students: live Socket.io socket count (no Redis lag)
    Promise.resolve(getOnlineStudentCount()),

    // Completed + in-progress: distinct students (a student who took 2 exams
    // counts as one completed, not two).
    db
      .select({ submitted: examSessions.submitted, count: sql<number>`count(distinct ${examSessions.userId})` })
      .from(examSessions)
      .where(
        or(
          eq(examSessions.submitted, 1),
          and(eq(examSessions.submitted, 0), gt(examSessions.endTime, now))
        )
      )
      .groupBy(examSessions.submitted),

    // Submitted sessions (examId + sessionId). Scores are graded in JS below via
    // the shared gradeQuestion so every question type is scored the same way the
    // recap does — the old SQL only compared selected_option_id to
    // correctOptionId, silently counting all fill_in_blank/matching/sorting
    // answers as wrong and diverging from the recap.
    db
      .select({ examId: examSessions.examId, sessionId: examSessions.id })
      .from(examSessions)
      .where(eq(examSessions.submitted, 1)),

    // Exam id+title for chart labels
    db.select({ id: exams.id, title: exams.title }).from(exams),

    // Eligible students: in a group that has ≥1 active exam
    db
      .selectDistinct({ userId: users.id })
      .from(users)
      .innerJoin(examGroups, eq(examGroups.groupId, users.groupId))
      .innerJoin(
        exams,
        and(eq(exams.id, examGroups.examId), eq(exams.isActive, 1))
      )
      .where(eq(users.role, "student")),

    // Distinct student IDs with a session for a currently-active exam
    db
      .selectDistinct({ userId: examSessions.userId })
      .from(examSessions)
      .innerJoin(exams, and(eq(exams.id, examSessions.examId), eq(exams.isActive, 1))),
  ]);

  // ── Session stats ──────────────────────────────────────────────────────────
  let completedCount = 0;
  let inProgressCount = 0;
  for (const row of sessionRows) {
    if (row.submitted === 1) completedCount = Number(row.count);
    else inProgressCount = Number(row.count);
  }

  const eligibleCount = eligibleRows.length;
  const sessionUserSet = new Set(sessionUserIds.map((r) => r.userId));
  const notStartedCount = eligibleRows.filter(
    (r) => !sessionUserSet.has(r.userId)
  ).length;

  const pct = (n: number) =>
    eligibleCount > 0 ? Math.round((n / eligibleCount) * 100) : 0;

  // ── Exam score summaries ───────────────────────────────────────────────────
  const titleMap = new Map(examTitles.map((e) => [e.id, e.title]));
  const byExam = new Map<string, number[]>();
  if (scoreRows.length > 0) {
    // Grade every submitted session in JS with the shared grader so all question
    // types are scored identically to the recap (matching/sorting also need the
    // per-session shuffle, which is impossible to reproduce in SQL).
    const examIds = [...new Set(scoreRows.map((r) => r.examId))];
    const sessionIds = scoreRows.map((r) => r.sessionId);
    const [gradedQuestions, gradedAnswers] = await Promise.all([
      db
        .select({
          id: questions.id,
          examId: questions.examId,
          type: questions.type,
          correctOptionId: questions.correctOptionId,
          config: questions.config,
        })
        .from(questions)
        .where(inArray(questions.examId, examIds)),
      db
        .select({
          sessionId: answers.sessionId,
          questionId: answers.questionId,
          selectedOptionId: answers.selectedOptionId,
          answerValue: answers.answerValue,
        })
        .from(answers)
        .where(inArray(answers.sessionId, sessionIds)),
    ]);

    const questionsByExam = new Map<string, typeof gradedQuestions>();
    for (const q of gradedQuestions) {
      const bucket = questionsByExam.get(q.examId) ?? [];
      bucket.push(q);
      questionsByExam.set(q.examId, bucket);
    }
    const answersBySession = new Map<string, Map<string, (typeof gradedAnswers)[number]>>();
    for (const a of gradedAnswers) {
      const bucket = answersBySession.get(a.sessionId) ?? new Map();
      bucket.set(a.questionId, a);
      answersBySession.set(a.sessionId, bucket);
    }

    for (const { examId, sessionId } of scoreRows) {
      const examQuestions = questionsByExam.get(examId) ?? [];
      const sessionAnswers = answersBySession.get(sessionId) ?? new Map();
      let correct = 0;
      for (const q of examQuestions) {
        const ans = sessionAnswers.get(q.id);
        if (!ans || (!ans.selectedOptionId && !ans.answerValue)) continue;
        if (gradeQuestion(q.type ?? "multiple_choice", q.correctOptionId, q.config, ans.selectedOptionId, ans.answerValue, { sessionId, questionId: q.id })) {
          correct++;
        }
      }
      const score = examQuestions.length > 0 ? Math.round((correct / examQuestions.length) * 100) : 0;
      const existing = byExam.get(examId);
      if (existing) existing.push(score);
      else byExam.set(examId, [score]);
    }
  }

  const examScores: ExamScoreSummary[] = [];
  for (const [examId, scores] of byExam) {
    const sorted = [...scores].sort((a, b) => a - b);
    examScores.push({
      examId,
      examTitle: titleMap.get(examId) ?? examId,
      min: sorted[0],
      median: calcMedian(scores),
      max: sorted[sorted.length - 1],
      totalSubmissions: scores.length,
    });
  }

  return {
    welcome: { name: adminName },
    stats: {
      totalStudents: Number(studentsResult[0]?.count ?? 0),
      totalGroups: Number(groupsResult[0]?.count ?? 0),
      totalExams: Number(examsResult[0]?.count ?? 0),
      onlineStudents: onlineCount,
      sessions: {
        completed:  { count: completedCount,  percentage: pct(completedCount) },
        inProgress: { count: inProgressCount, percentage: pct(inProgressCount) },
        notStarted: { count: notStartedCount, percentage: pct(notStartedCount) },
      },
    },
    examScores,
  };
}

/**
 * Recomputes stats and pushes `dashboard:stats` to all connected
 * admins/supervisors. No-op when the broadcaster hasn't been wired yet
 * (e.g. during tests that don't initialise Socket.io).
 */
export async function notifyDashboardStats(): Promise<void> {
  if (!broadcaster) return;
  try {
    // Use a placeholder name for broadcast-triggered recomputes; the welcome
    // field is only meaningful on initial page load (personalised per user).
    const snapshot = await computeStats("Admin");
    broadcaster(snapshot);
  } catch (error) {
    log.error("Failed to compute dashboard stats for broadcast", error);
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export const adminDashboardRoutes = new Elysia({ prefix: "/admin" })
  .use(authPlugin)
  .onBeforeHandle(requireAdmin)

  /**
   * GET /api/admin/dashboard
   *
   * Returns a full stats snapshot personalised with the calling admin's name.
   */
  .get("/dashboard", async ({ user }) => {
    log.info("Dashboard snapshot requested", { adminId: user.userId });
    const adminRow = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, user.userId))
      .limit(1);
    const adminName = adminRow[0]?.name ?? "Admin";
    return computeStats(adminName);
  });
