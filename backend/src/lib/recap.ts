/**
 * Azhura CBT Backend — Aggregate Recap Helpers (#19)
 *
 * Server-side scoring and statistics for the admin recap views: a per-exam
 * recap (all participants + class stats) and a per-student recap (one student's
 * history across exams). Scores are derived from `answers.selected_option_id`
 * vs `questions.correct_option_id` — never trusted from any client — using the
 * same percentage semantics as {@link gradeAgainstKey} in `exam-scoring.ts`
 * (`round(totalCorrect / totalQuestions * 100)`, denominator = exam questions).
 *
 * The per-session correct/answered counts are computed in a single grouped SQL
 * aggregation (no N+1). Participant/history sets are bounded (one exam or one
 * student's worth of sessions), so the full filtered set is fetched once to
 * compute stats over the whole set, then paginated in memory.
 */

import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { NotFoundError } from "./errors";
import { deriveSessionStatus, type SessionStatus } from "./exam-scoring";
import type {
  ExamRecapResponse,
  RecapParticipant,
  StudentRecapEntry,
  StudentRecapResponse,
} from "@azhura/shared";

const { answers, exams, groups, questions, examSessions, users } = schema;

/** Default page size when the caller omits `limit`. */
const DEFAULT_LIMIT = 50;
/** Hard cap on page size so a hostile/buggy caller can't ask for everything. */
const MAX_LIMIT = 200;

/** Per-session aggregate row produced by the grouped scoring query. */
interface SessionAggregate {
  submitted: number;
  endTime: number;
  /** Answers matching the question's correct option. */
  correct: number;
  /** Answers with a non-null selected option (i.e. actually answered). */
  answered: number;
}

/** Filters/paging shared shape for both recap queries. */
interface RecapPaging {
  page?: number;
  limit?: number;
  from?: number;
  to?: number;
}

/** Clamps page/limit to safe bounds (mirrors `log-store.queryLogs`). */
const clampPaging = (page?: number, limit?: number) => ({
  page: Math.max(1, Math.floor(page ?? 1)),
  limit: Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit ?? DEFAULT_LIMIT))),
});

/**
 * Score as a rounded percentage of correct answers. Matches `gradeAgainstKey`:
 * an exam with no questions scores 0 (no division by zero).
 */
export const scoreFromCounts = (
  totalCorrect: number,
  totalQuestions: number
): number =>
  totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

/** Aggregate score statistics over a set of graded sessions. */
export interface RecapStats {
  average: number | null;
  highest: number | null;
  lowest: number | null;
  completedCount: number;
}

/**
 * Computes average (rounded), highest, and lowest over the given graded scores.
 * An empty input yields all-null stats with `completedCount = 0` — callers pass
 * only the scores of sessions that actually have a final grade.
 */
export const computeRecapStats = (scores: readonly number[]): RecapStats => {
  if (scores.length === 0) {
    return { average: null, highest: null, lowest: null, completedCount: 0 };
  }
  const sum = scores.reduce((acc, s) => acc + s, 0);
  return {
    average: Math.round(sum / scores.length),
    highest: Math.max(...scores),
    lowest: Math.min(...scores),
    completedCount: scores.length,
  };
};

/**
 * Derives the per-question breakdown for one session. `totalCorrect`/`totalWrong`
 * are clamped to non-negative; `totalEmpty` is the questions never answered.
 * `score` is null while the session is still in progress (no final grade yet).
 */
const breakdown = (
  agg: SessionAggregate,
  totalQuestions: number,
  status: SessionStatus
) => {
  const totalCorrect = Math.max(0, Number(agg.correct));
  const answered = Math.max(0, Number(agg.answered));
  return {
    status,
    score: status === "in_progress" ? null : scoreFromCounts(totalCorrect, totalQuestions),
    totalCorrect,
    totalWrong: Math.max(0, answered - totalCorrect),
    totalEmpty: Math.max(0, totalQuestions - answered),
  };
};

/** The grouped correct/answered aggregate, summed per joined answer row. */
const correctExpr = sql<number>`sum(case when ${answers.selectedOptionId} = ${questions.correctOptionId} then 1 else 0 end)`;
const answeredExpr = sql<number>`sum(case when ${answers.selectedOptionId} is not null then 1 else 0 end)`;

/**
 * Per-exam recap: every participant's score plus class statistics, filtered by
 * group/time and paginated. Stats are computed over the whole filtered set, not
 * just the returned page.
 *
 * @throws {NotFoundError} when the exam does not exist.
 */
export const getExamRecap = async (
  examId: string,
  opts: RecapPaging & { groupId?: string } = {}
): Promise<ExamRecapResponse> => {
  const exam = await db.query.exams.findFirst({
    columns: { id: true, title: true },
    where: eq(exams.id, examId),
  });
  if (!exam) throw new NotFoundError("Ujian tidak ditemukan.");

  const totalQuestions = await countExamQuestions(examId);

  const conditions = [eq(examSessions.examId, examId)];
  if (opts.groupId) conditions.push(eq(users.groupId, opts.groupId));
  if (opts.from != null) conditions.push(gte(examSessions.startTime, opts.from));
  if (opts.to != null) conditions.push(lte(examSessions.startTime, opts.to));

  const rows = await db
    .select({
      sessionId: examSessions.id,
      userId: examSessions.userId,
      name: users.name,
      nis: users.nis,
      groupName: groups.name,
      startTime: examSessions.startTime,
      endTime: examSessions.endTime,
      submitted: examSessions.submitted,
      correct: correctExpr,
      answered: answeredExpr,
    })
    .from(examSessions)
    .innerJoin(users, eq(users.id, examSessions.userId))
    .leftJoin(groups, eq(groups.id, users.groupId))
    .leftJoin(answers, eq(answers.sessionId, examSessions.id))
    .leftJoin(questions, eq(questions.id, answers.questionId))
    .where(and(...conditions))
    .groupBy(
      examSessions.id,
      examSessions.userId,
      users.name,
      users.nis,
      groups.name,
      examSessions.startTime,
      examSessions.endTime,
      examSessions.submitted
    )
    .orderBy(asc(users.name));

  const now = Date.now();
  const participants: RecapParticipant[] = rows.map((r) => {
    const status = deriveSessionStatus(r.submitted, r.endTime, now);
    return {
      sessionId: r.sessionId,
      userId: r.userId,
      name: r.name,
      nis: r.nis,
      groupName: r.groupName ?? null,
      startTime: r.startTime,
      endTime: r.endTime,
      ...breakdown(r, totalQuestions, status),
    };
  });

  const stats = computeRecapStats(
    participants
      .filter((p) => p.score !== null)
      .map((p) => p.score as number)
  );

  const { page, limit } = clampPaging(opts.page, opts.limit);
  const start = (page - 1) * limit;

  return {
    exam: { id: exam.id, title: exam.title, totalQuestions },
    stats: {
      totalParticipants: participants.length,
      completedCount: stats.completedCount,
      average: stats.average,
      highest: stats.highest,
      lowest: stats.lowest,
    },
    participants: participants.slice(start, start + limit),
    total: participants.length,
    page,
    limit,
  };
};

/**
 * Per-student recap: one student's exam history with scores, filtered by
 * exam/time and paginated. Stats are computed over the whole filtered set.
 *
 * @throws {NotFoundError} when the student does not exist.
 */
export const getStudentRecap = async (
  studentId: string,
  opts: RecapPaging & { examId?: string } = {}
): Promise<StudentRecapResponse> => {
  const student = await db.query.users.findFirst({
    columns: { id: true, name: true, nis: true },
    with: { group: { columns: { name: true } } },
    where: eq(users.id, studentId),
  });
  if (!student) throw new NotFoundError("Siswa tidak ditemukan.");

  const conditions = [eq(examSessions.userId, studentId)];
  if (opts.examId) conditions.push(eq(examSessions.examId, opts.examId));
  if (opts.from != null) conditions.push(gte(examSessions.startTime, opts.from));
  if (opts.to != null) conditions.push(lte(examSessions.startTime, opts.to));

  const rows = await db
    .select({
      sessionId: examSessions.id,
      examId: examSessions.examId,
      examTitle: exams.title,
      startTime: examSessions.startTime,
      endTime: examSessions.endTime,
      submitted: examSessions.submitted,
      totalQuestions: sql<number>`count(distinct ${questions.id})`,
      correct: correctExpr,
      answered: answeredExpr,
    })
    .from(examSessions)
    .innerJoin(exams, eq(exams.id, examSessions.examId))
    .leftJoin(questions, eq(questions.examId, examSessions.examId))
    .leftJoin(
      answers,
      and(
        eq(answers.sessionId, examSessions.id),
        eq(answers.questionId, questions.id)
      )
    )
    .where(and(...conditions))
    .groupBy(
      examSessions.id,
      examSessions.examId,
      exams.title,
      examSessions.startTime,
      examSessions.endTime,
      examSessions.submitted
    )
    .orderBy(desc(examSessions.startTime));

  const now = Date.now();
  const history: StudentRecapEntry[] = rows.map((r) => {
    const totalQuestions = Number(r.totalQuestions);
    const status = deriveSessionStatus(r.submitted, r.endTime, now);
    return {
      sessionId: r.sessionId,
      examId: r.examId,
      examTitle: r.examTitle,
      startTime: r.startTime,
      endTime: r.endTime,
      ...breakdown(r, totalQuestions, status),
    };
  });

  const stats = computeRecapStats(
    history.filter((h) => h.score !== null).map((h) => h.score as number)
  );

  const { page, limit } = clampPaging(opts.page, opts.limit);
  const start = (page - 1) * limit;

  return {
    student: {
      id: student.id,
      name: student.name,
      nis: student.nis,
      groupName: student.group?.name ?? null,
    },
    stats: {
      examsTaken: history.length,
      completedCount: stats.completedCount,
      average: stats.average,
    },
    history: history.slice(start, start + limit),
    total: history.length,
    page,
    limit,
  };
};

/** Counts the questions belonging to an exam (the score denominator). */
const countExamQuestions = async (examId: string): Promise<number> => {
  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(questions)
    .where(eq(questions.examId, examId));
  return Number(row?.total ?? 0);
};
