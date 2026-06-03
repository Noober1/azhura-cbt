/**
 * Azhura CBT Backend - Exam Scoring & Session Helpers
 *
 * Shared grading logic plus active-session lookup and server-side finalization,
 * used by the exam routes (#4 resume-session). Keeping grading in one pure
 * function ({@link gradeAgainstKey}) means manual submit and lazy finalization
 * of an expired session score answers identically.
 */

import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { createLogger } from "./logger";

const { exams, questions, examSessions, answers } = schema;

const log = createLogger("ExamScoring");

/** The score breakdown returned to clients (mirrors shared `ExamResult`). */
export interface ExamScore {
  score: number;
  totalCorrect: number;
  totalWrong: number;
  totalEmpty: number;
}

/** One answer-key entry: a question and its correct option. */
export interface AnswerKeyEntry {
  id: string;
  correctOptionId: string;
}

/**
 * Grades a set of selections against an answer key. Pure (no I/O): every key
 * question is counted as correct / wrong / empty, and the score is the rounded
 * percentage of correct answers. An empty key yields a score of 0 (no div-by-zero).
 *
 * @param key Answer-key entries for every question in the exam.
 * @param selectedByQuestion Map of questionId → selected optionId (or null/absent = empty).
 */
export const gradeAgainstKey = (
  key: readonly AnswerKeyEntry[],
  selectedByQuestion: ReadonlyMap<string, string | null>
): ExamScore => {
  let totalCorrect = 0;
  let totalWrong = 0;
  let totalEmpty = 0;

  for (const q of key) {
    const selected = selectedByQuestion.get(q.id) ?? null;
    if (!selected) {
      totalEmpty++;
    } else if (selected === q.correctOptionId) {
      totalCorrect++;
    } else {
      totalWrong++;
    }
  }

  const totalQuestions = key.length;
  const score =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  return { score, totalCorrect, totalWrong, totalEmpty };
};

/** An in-progress (unsubmitted) session enriched with display metadata. */
export interface ActiveSession {
  id: string;
  examId: string;
  examTitle: string;
  totalQuestions: number;
  startTime: number;
  endTime: number;
}

/**
 * Returns the user's most recent unsubmitted session (enriched with exam title
 * and live question count), or `null` when none exists.
 */
export const findActiveSession = async (
  userId: string
): Promise<ActiveSession | null> => {
  const session = await db
    .select({
      id: examSessions.id,
      examId: examSessions.examId,
      examTitle: exams.title,
      startTime: examSessions.startTime,
      endTime: examSessions.endTime,
    })
    .from(examSessions)
    .innerJoin(exams, eq(exams.id, examSessions.examId))
    .where(and(eq(examSessions.userId, userId), eq(examSessions.submitted, 0)))
    .orderBy(desc(examSessions.createdAt))
    .limit(1);

  if (session.length === 0) return null;
  const row = session[0];

  const key = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.examId, row.examId));

  return { ...row, totalQuestions: key.length };
};

/**
 * Finalizes a session whose time has expired but was never submitted: grades the
 * answers already persisted for it (authoritative, server-side) and marks it
 * submitted, in a single transaction. Returns the computed score.
 */
export const finalizeSession = async (session: {
  id: string;
  examId: string;
}): Promise<ExamScore> => {
  const key = await db
    .select({ id: questions.id, correctOptionId: questions.correctOptionId })
    .from(questions)
    .where(eq(questions.examId, session.examId));

  const stored = await db
    .select({
      questionId: answers.questionId,
      selectedOptionId: answers.selectedOptionId,
    })
    .from(answers)
    .where(eq(answers.sessionId, session.id));

  const selectedByQuestion = new Map<string, string | null>(
    stored.map((a) => [a.questionId, a.selectedOptionId])
  );

  const result = gradeAgainstKey(key, selectedByQuestion);

  await db
    .update(examSessions)
    .set({ submitted: 1 })
    .where(eq(examSessions.id, session.id));

  log.info("Expired session finalized server-side", {
    sessionId: session.id,
    examId: session.examId,
    score: result.score,
  });

  return result;
};
