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
import { gradeFillInBlank, gradeMatching, gradeSorting } from "./grading";
import { sessionPermutation } from "./session-shuffle";
import type { FillInBlankConfig, MatchingConfig, SortingConfig } from "@azhura/shared";

const { exams, questions, examSessions, answers } = schema;

/**
 * Identifies which session/question is being graded so matching/sorting can
 * re-derive the secret per-session permutation the questions endpoint used
 * (see {@link sessionPermutation}). Required for matching/sorting; unused for
 * MC/fill-in-blank.
 */
export interface GradeContext {
  sessionId: string;
  questionId: string;
}

/**
 * Grade a single question by type. Returns true if correct, false otherwise.
 * Handles MC, fill_in_blank, matching, and sorting. Matching/sorting need
 * `ctx` to re-derive their per-session shuffle; without it they cannot be
 * graded and return false (never a false pass).
 */
export function gradeQuestion(
  type: string,
  correctOptionId: string | null,
  config: unknown,
  selectedOptionId: string | null,
  answerValue: string | null,
  ctx?: GradeContext
): boolean {
  // MariaDB returns JSON columns as raw strings — parse before use.
  let cfg: unknown = config;
  if (typeof config === "string") {
    try {
      cfg = JSON.parse(config);
    } catch {
      log.warn("Failed to parse question config JSON during grading", { type, config });
      cfg = null;
    }
  }

  switch (type) {
    case "multiple_choice":
      return !!correctOptionId && selectedOptionId === correctOptionId;
    case "fill_in_blank": {
      if (!answerValue || !cfg) return false;
      try {
        return gradeFillInBlank(answerValue, cfg as FillInBlankConfig);
      } catch {
        // A malformed config (e.g. `answers` not an array) must not throw — that
        // would 500 submit/finalize/recap for the whole exam. Treat as wrong.
        log.warn("fill_in_blank grading failed on malformed config", { config: cfg });
        return false;
      }
    }
    case "matching": {
      if (!answerValue || !cfg || !ctx) return false;
      try {
        const pairs = (cfg as MatchingConfig).pairs ?? [];
        const perm = sessionPermutation(ctx.sessionId, ctx.questionId, pairs.length);
        return gradeMatching(JSON.parse(answerValue) as [number, number][], perm);
      } catch {
        return false;
      }
    }
    case "sorting": {
      if (!answerValue || !cfg || !ctx) return false;
      try {
        const items = (cfg as SortingConfig).items ?? [];
        const perm = sessionPermutation(ctx.sessionId, ctx.questionId, items.length);
        return gradeSorting(JSON.parse(answerValue) as number[], cfg as SortingConfig, perm);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

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

/** Lifecycle of an exam session as derived from `submitted` + `end_time`. */
export type SessionStatus = "in_progress" | "completed" | "expired";

/**
 * Derives a session's display status. A submitted session is `completed`; an
 * unsubmitted one is `in_progress` while time remains and `expired` once its
 * `endTime` has elapsed. Shared by the admin sessions list (#45) and the
 * aggregate recap (#19) so both label sessions identically.
 */
export const deriveSessionStatus = (
  submitted: number,
  endTime: number,
  now: number
): SessionStatus => {
  if (submitted === 1) return "completed";
  if (endTime > now) return "in_progress";
  return "expired";
};

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
  passingGrade: number;
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
      passingGrade: exams.passingGrade,
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
  const allQuestions = await db
    .select({
      id: questions.id,
      type: questions.type,
      correctOptionId: questions.correctOptionId,
      config: questions.config,
    })
    .from(questions)
    .where(eq(questions.examId, session.examId));

  const stored = await db
    .select({
      questionId: answers.questionId,
      selectedOptionId: answers.selectedOptionId,
      answerValue: answers.answerValue,
    })
    .from(answers)
    .where(eq(answers.sessionId, session.id));

  const answerMap = new Map(stored.map((a) => [a.questionId, a]));

  let totalCorrect = 0;
  let totalWrong = 0;
  let totalEmpty = 0;

  for (const q of allQuestions) {
    const stored = answerMap.get(q.id);
    const isEmpty =
      !stored || (!stored.selectedOptionId && !stored.answerValue);
    if (isEmpty) {
      totalEmpty++;
    } else if (
      gradeQuestion(
        q.type ?? "multiple_choice",
        q.correctOptionId,
        q.config,
        stored?.selectedOptionId ?? null,
        stored?.answerValue ?? null,
        { sessionId: session.id, questionId: q.id }
      )
    ) {
      totalCorrect++;
    } else {
      totalWrong++;
    }
  }

  const totalQuestions = allQuestions.length;
  const score =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const result: ExamScore = { score, totalCorrect, totalWrong, totalEmpty };

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
