/**
 * Azhura CBT Backend — Aggregate Recap Helpers (#19, fix #114)
 *
 * Server-side scoring for the admin recap views: a per-exam recap (all
 * participants + class stats) and a per-student recap (one student's history
 * across exams). Scores are computed by grading each stored answer with
 * {@link gradeQuestion} (handles MC, fill_in_blank, matching, sorting).
 *
 * Session metadata and answers are fetched in batch queries (no N+1):
 * one query for session rows, one for exam questions, one for all answers
 * across the relevant sessions.
 */

import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "../db";
import { NotFoundError } from "./errors";
import { deriveSessionStatus, gradeQuestion, type SessionStatus } from "./exam-scoring";
import type {
  ExamRecapResponse,
  ExamRecapStats,
  RecapParticipant,
  StudentRecapEntry,
  StudentRecapResponse,
  StudentRecapStats,
} from "@azhura/shared";

const { answers, exams, groups, questions, examSessions, users } = schema;

/** Default page size when the caller omits `limit`. */
const DEFAULT_LIMIT = 50;
/** Hard cap on page size so a hostile/buggy caller can't ask for everything. */
const MAX_LIMIT = 200;

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
 * Score as a rounded percentage of correct answers. An exam with no questions
 * scores 0 (no division by zero).
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
 * An empty input yields all-null stats with `completedCount = 0`.
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

/** One question entry used for application-layer grading. */
interface QuestionKey {
  id: string;
  type: string | null;
  correctOptionId: string | null;
  config: unknown;
}

/** Per-session answer lookup keyed by questionId. */
type SessionAnswerMap = ReadonlyMap<
  string,
  ReadonlyMap<string, { selectedOptionId: string | null; answerValue: string | null }>
>;

/**
 * Grades all exam questions for a single session against its stored answers.
 * Delegates to {@link gradeQuestion} so every question type is handled
 * correctly — MC, fill_in_blank, matching, and sorting.
 */
function gradeSession(
  sessionId: string,
  status: SessionStatus,
  examQuestions: QuestionKey[],
  answersBySession: SessionAnswerMap
): { score: number | null; status: SessionStatus; totalCorrect: number; totalWrong: number; totalEmpty: number } {
  const sessionAnswers = answersBySession.get(sessionId) ?? new Map();
  let totalCorrect = 0;
  let totalWrong = 0;
  let totalEmpty = 0;

  for (const q of examQuestions) {
    const ans = sessionAnswers.get(q.id);
    const isEmpty = !ans || (!ans.selectedOptionId && !ans.answerValue);
    if (isEmpty) {
      totalEmpty++;
    } else if (
      gradeQuestion(
        q.type ?? "multiple_choice",
        q.correctOptionId,
        q.config,
        ans.selectedOptionId,
        ans.answerValue,
        { sessionId, questionId: q.id }
      )
    ) {
      totalCorrect++;
    } else {
      totalWrong++;
    }
  }

  return {
    status,
    score: status === "in_progress" ? null : scoreFromCounts(totalCorrect, examQuestions.length),
    totalCorrect,
    totalWrong,
    totalEmpty,
  };
}

/**
 * Fetches all answers for a set of sessions as a nested Map:
 * `sessionId → (questionId → {selectedOptionId, answerValue})`.
 * Single query — no N+1.
 */
async function fetchAnswersBySession(sessionIds: string[]): Promise<SessionAnswerMap> {
  const map = new Map<string, Map<string, { selectedOptionId: string | null; answerValue: string | null }>>();
  if (sessionIds.length === 0) return map;

  const rows = await db
    .select({
      sessionId: answers.sessionId,
      questionId: answers.questionId,
      selectedOptionId: answers.selectedOptionId,
      answerValue: answers.answerValue,
    })
    .from(answers)
    .where(inArray(answers.sessionId, sessionIds));

  for (const row of rows) {
    if (!map.has(row.sessionId)) map.set(row.sessionId, new Map());
    map.get(row.sessionId)!.set(row.questionId, {
      selectedOptionId: row.selectedOptionId,
      answerValue: row.answerValue,
    });
  }
  return map;
}

/**
 * Fetches all questions for a given exam as {@link QuestionKey} entries.
 * Single query.
 */
async function fetchExamQuestions(examId: string): Promise<QuestionKey[]> {
  return db
    .select({
      id: questions.id,
      type: questions.type,
      correctOptionId: questions.correctOptionId,
      config: questions.config,
    })
    .from(questions)
    .where(eq(questions.examId, examId));
}

/** Filters (no paging) shared by the per-exam recap query and its export. */
export interface ExamRecapFilters {
  groupId?: string;
  from?: number;
  to?: number;
}

/** The full (un-paginated) per-exam recap: meta + stats + every participant. */
export interface ExamRecapData {
  exam: { id: string; title: string; totalQuestions: number };
  stats: ExamRecapStats;
  participants: RecapParticipant[];
}

/**
 * Collects the complete per-exam recap (all participants, no paging), filtered
 * by group/time. Backs both the paginated endpoint and the xlsx export so they
 * always agree. Stats are computed over the whole filtered set.
 *
 * @throws {NotFoundError} when the exam does not exist.
 */
export const collectExamRecap = async (
  examId: string,
  opts: ExamRecapFilters = {}
): Promise<ExamRecapData> => {
  const exam = await db.query.exams.findFirst({
    columns: { id: true, title: true },
    where: eq(exams.id, examId),
  });
  if (!exam) throw new NotFoundError("Ujian tidak ditemukan.");

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
    })
    .from(examSessions)
    .innerJoin(users, eq(users.id, examSessions.userId))
    .leftJoin(groups, eq(groups.id, users.groupId))
    .where(and(...conditions))
    .orderBy(asc(users.name));

  const sessionIds = rows.map((r) => r.sessionId);
  const [examQuestions, answersBySession] = await Promise.all([
    fetchExamQuestions(examId),
    fetchAnswersBySession(sessionIds),
  ]);
  const totalQuestions = examQuestions.length;
  const now = Date.now();

  const participants: RecapParticipant[] = rows.map((r) => {
    const status = deriveSessionStatus(r.submitted, r.endTime, now);
    const grades = gradeSession(r.sessionId, status, examQuestions, answersBySession);
    return {
      sessionId: r.sessionId,
      userId: r.userId,
      name: r.name,
      nis: r.nis,
      groupName: r.groupName ?? null,
      startTime: r.startTime,
      endTime: r.endTime,
      ...grades,
    };
  });

  const stats = computeRecapStats(
    participants.filter((p) => p.score !== null).map((p) => p.score as number)
  );

  return {
    exam: { id: exam.id, title: exam.title, totalQuestions },
    stats: {
      totalParticipants: participants.length,
      completedCount: stats.completedCount,
      average: stats.average,
      highest: stats.highest,
      lowest: stats.lowest,
    },
    participants,
  };
};

/**
 * Per-exam recap, paginated for the API. Thin wrapper over {@link collectExamRecap}.
 *
 * @throws {NotFoundError} when the exam does not exist.
 */
export const getExamRecap = async (
  examId: string,
  opts: RecapPaging & { groupId?: string } = {}
): Promise<ExamRecapResponse> => {
  const data = await collectExamRecap(examId, {
    groupId: opts.groupId,
    from: opts.from,
    to: opts.to,
  });

  const { page, limit } = clampPaging(opts.page, opts.limit);
  const start = (page - 1) * limit;

  return {
    exam: data.exam,
    stats: data.stats,
    participants: data.participants.slice(start, start + limit),
    total: data.participants.length,
    page,
    limit,
  };
};

/** Filters (no paging) shared by the per-student recap query and its export. */
export interface StudentRecapFilters {
  examId?: string;
  from?: number;
  to?: number;
}

/** The full (un-paginated) per-student recap: student + stats + all history. */
export interface StudentRecapData {
  student: { id: string; name: string; nis: string; groupName: string | null };
  stats: StudentRecapStats;
  history: StudentRecapEntry[];
}

/**
 * Collects the complete per-student recap (all exam history, no paging),
 * filtered by exam/time. Backs both the paginated endpoint and the xlsx export.
 *
 * @throws {NotFoundError} when the student does not exist.
 */
export const collectStudentRecap = async (
  studentId: string,
  opts: StudentRecapFilters = {}
): Promise<StudentRecapData> => {
  const [student] = await db
    .select({
      id: users.id,
      name: users.name,
      nis: users.nis,
      groupName: groups.name,
    })
    .from(users)
    .leftJoin(groups, eq(groups.id, users.groupId))
    .where(eq(users.id, studentId))
    .limit(1);
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
    })
    .from(examSessions)
    .innerJoin(exams, eq(exams.id, examSessions.examId))
    .where(and(...conditions))
    .orderBy(desc(examSessions.startTime));

  // Batch: fetch questions for all distinct exams + answers for all sessions.
  const distinctExamIds = [...new Set(rows.map((r) => r.examId))];
  const sessionIds = rows.map((r) => r.sessionId);

  const [allQuestions, answersBySession] = await Promise.all([
    distinctExamIds.length > 0
      ? db
          .select({
            examId: questions.examId,
            id: questions.id,
            type: questions.type,
            correctOptionId: questions.correctOptionId,
            config: questions.config,
          })
          .from(questions)
          .where(inArray(questions.examId, distinctExamIds))
      : Promise.resolve([] as Array<{ examId: string; id: string; type: string | null; correctOptionId: string | null; config: unknown }>),
    fetchAnswersBySession(sessionIds),
  ]);

  // Group questions by examId for O(1) lookup per session.
  const questionsByExam = new Map<string, QuestionKey[]>();
  for (const q of allQuestions) {
    if (!questionsByExam.has(q.examId)) questionsByExam.set(q.examId, []);
    questionsByExam.get(q.examId)!.push(q);
  }

  const now = Date.now();
  const history: StudentRecapEntry[] = rows.map((r) => {
    const examQs = questionsByExam.get(r.examId) ?? [];
    const status = deriveSessionStatus(r.submitted, r.endTime, now);
    const grades = gradeSession(r.sessionId, status, examQs, answersBySession);
    return {
      sessionId: r.sessionId,
      examId: r.examId,
      examTitle: r.examTitle,
      startTime: r.startTime,
      endTime: r.endTime,
      ...grades,
    };
  });

  const stats = computeRecapStats(
    history.filter((h) => h.score !== null).map((h) => h.score as number)
  );

  return {
    student: {
      id: student.id,
      name: student.name,
      nis: student.nis,
      groupName: student.groupName ?? null,
    },
    stats: {
      examsTaken: history.length,
      completedCount: stats.completedCount,
      average: stats.average,
    },
    history,
  };
};

/**
 * Per-student recap, paginated for the API. Thin wrapper over
 * {@link collectStudentRecap}.
 *
 * @throws {NotFoundError} when the student does not exist.
 */
export const getStudentRecap = async (
  studentId: string,
  opts: RecapPaging & { examId?: string } = {}
): Promise<StudentRecapResponse> => {
  const data = await collectStudentRecap(studentId, {
    examId: opts.examId,
    from: opts.from,
    to: opts.to,
  });

  const { page, limit } = clampPaging(opts.page, opts.limit);
  const start = (page - 1) * limit;

  return {
    student: data.student,
    stats: data.stats,
    history: data.history.slice(start, start + limit),
    total: data.history.length,
    page,
    limit,
  };
};
