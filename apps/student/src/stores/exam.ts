/**
 * Azhura CBT App - Exam Session Store (Zustand)
 *
 * Single source of truth for an in-progress exam: session metadata, the
 * question list, the student's answers and "ragu-ragu" (flag) state, the
 * countdown, and the final result.
 *
 * Offline-first design: every answer is written to local storage immediately
 * and, when online, also POSTed to the server. Failed server writes are queued
 * in the connectivity store for later sync. Session metadata is mirrored to
 * `localStorage` so a refresh/restart restores the exam in progress.
 */

import { create } from "zustand";
import { Question, ExamAnswer, ExamSession, ExamResult } from "../types";
import { saveAnswerToLocalDb, clearLocalDbAnswers, getAnswersFromLocalDb } from "../lib/storage";
import { useConnectivityStore } from "./connectivity";
import api from "../lib/api";
import { createLogger } from "../lib/logger";
import { safeJsonParse, toErrorContext } from "../lib/errors";
import { createKeyedDebouncer } from "../lib/debounce";

const log = createLogger("Exam");

const isBrowser = typeof window !== "undefined";

/**
 * Trailing delay (ms) before an answer change is pushed to the server. The
 * local save is immediate; this only debounces the *network* write so rapidly
 * toggling options on one question collapses into a single POST (#10).
 */
const ANSWER_SYNC_DEBOUNCE_MS = 600;

/** Debounces the outbound answer POST per `questionId` (singleton store). */
const answerSyncDebouncer = createKeyedDebouncer<string>(ANSWER_SYNC_DEBOUNCE_MS);

interface ExamState {
  examSessionId: string | null;
  examId: string | null;
  examTitle: string | null;
  totalQuestions: number;
  questions: Question[];
  currentQuestionIndex: number;
  answers: Record<string, ExamAnswer>;
  flaggedQuestions: Record<string, boolean>;
  startTime: number | null;
  endTime: number | null;
  /**
   * Clock-skew offset (ms): `serverTime − clientNow` captured at the last server
   * sync (session create / resume / time-change). The countdown is derived from
   * `endTime − (Date.now() + serverTimeOffset)` so it stays aligned with the
   * authoritative server clock even when the local clock is skewed (#8).
   */
  serverTimeOffset: number;
  timeRemaining: number;
  examResult: ExamResult | null;
  isSubmitting: boolean;
  /**
   * True while {@link finalizeExam} is running: the exam is being submitted and
   * retried until the server accepts it. Drives the blocking Processing overlay
   * that locks the UI so a student is never stranded on a failed submit (#8).
   */
  finalizing: boolean;
  /** Last submission error message, for surfacing/tracing failed submits. */
  submitError: string | null;

  setExamSession: (session: ExamSession & { serverTime?: number }) => Promise<void>;
  /**
   * Loads a server-finalized result (e.g. an expired session scored on resume,
   * #4) into state so the result page can render it without a manual submit.
   */
  applyFinalizedResult: (result: ExamResult, examTitle: string) => void;
  setQuestions: (questions: Question[]) => void;
  setCurrentQuestionIndex: (index: number) => void;
  submitAnswer: (questionId: string, selectedOptionId: string | null, answerValue?: string | null) => Promise<void>;
  toggleFlagQuestion: (questionId: string) => Promise<void>;
  setTimeRemaining: (time: number | ((prev: number) => number)) => void;
  submitExam: () => Promise<ExamResult | null>;
  /**
   * Finalizes the exam reliably: shows the Processing lock and retries
   * {@link submitExam} with capped backoff until the server accepts it (the
   * submit is idempotent server-side, so retries are safe). Used by manual
   * "Selesai", timer expiry, and supervisor force-submit (#8).
   */
  finalizeExam: () => Promise<ExamResult | null>;
  /**
   * Applies a supervisor time change (#8): sets the new authoritative `endTime`,
   * re-derives the clock-skew offset from `serverTime`, and recomputes the
   * countdown live.
   */
  applyTimeChange: (endTime: number, serverTime: number) => void;
  loadPersistedAnswers: () => Promise<void>;
  resetExam: () => void;
  restoreSession: () => void;
}

/** Reads a numeric localStorage value, defaulting to 0 when absent/invalid. */
const readNumber = (key: string): number =>
  isBrowser ? Number(localStorage.getItem(key) || "0") : 0;

/**
 * Seconds remaining until `endTime`, clamped to >= 0. `offset` (ms) corrects for
 * client clock skew: the "now" we compare against is `Date.now() + offset`, which
 * approximates the server clock the `endTime` was issued in (#8).
 */
const secondsUntil = (endTime: number | null, offset = 0): number =>
  endTime ? Math.max(0, Math.floor((endTime - (Date.now() + offset)) / 1000)) : 0;

const storedEndTime = isBrowser
  ? readNumber("cbt_exam_end_time") || null
  : null;
const storedOffset = isBrowser ? readNumber("cbt_server_time_offset") : 0;

/** Capped exponential backoff (ms) for the finalize/submit retry loop. */
const FINALIZE_BACKOFF_START_MS = 1000;
const FINALIZE_BACKOFF_MAX_MS = 15000;

/** localStorage keys that make up a persisted exam session. */
const SESSION_KEYS = [
  "cbt_exam_session_id",
  "cbt_exam_id",
  "cbt_exam_title",
  "cbt_total_questions",
  "cbt_questions",
  "cbt_current_question_index",
  "cbt_exam_start_time",
  "cbt_exam_end_time",
  "cbt_server_time_offset",
] as const;

export const useExamStore = create<ExamState>((set, get) => {
  /**
   * Pushes the latest answer for a question to the server. Reads from state at
   * call time so the debounced trailing call always sends the most recent
   * selection. On failure/offline the answer is queued for batch re-sync.
   */
  const pushAnswerToServer = async (questionId: string): Promise<void> => {
    const { examId, examSessionId, answers } = get();
    const answer = answers[questionId];
    if (!answer) return;

    const isOnline = useConnectivityStore.getState().isOnline;
    if (isOnline && examId && examSessionId) {
      try {
        await api.post(`/exams/${examId}/answer`, {
          sessionId: examSessionId,
          questionId,
          selectedOptionId: answer.selectedOptionId ?? null,
          answerValue: answer.answerValue ?? null,
          timestamp: answer.timestamp,
        });
      } catch (error) {
        // Network/server failure: queue for background re-sync instead of losing it.
        log.warn("Answer sync failed — queued for retry", {
          questionId,
          ...toErrorContext(error),
        });
        useConnectivityStore.getState().addPendingAnswer(answer);
      }
    } else {
      useConnectivityStore.getState().addPendingAnswer(answer);
    }
  };

  return {
  examSessionId: isBrowser ? localStorage.getItem("cbt_exam_session_id") : null,
  examId: isBrowser ? localStorage.getItem("cbt_exam_id") : null,
  examTitle: isBrowser ? localStorage.getItem("cbt_exam_title") : null,
  totalQuestions: readNumber("cbt_total_questions"),
  // safeJsonParse guards against a corrupted `cbt_questions` entry crashing bootstrap.
  questions: isBrowser
    ? safeJsonParse<Question[]>(localStorage.getItem("cbt_questions"), [], "cbt_questions")
    : [],
  currentQuestionIndex: readNumber("cbt_current_question_index"),
  answers: {},
  flaggedQuestions: {},
  startTime: isBrowser ? readNumber("cbt_exam_start_time") || null : null,
  endTime: storedEndTime,
  serverTimeOffset: storedOffset,
  timeRemaining: secondsUntil(storedEndTime, storedOffset),
  examResult: null,
  isSubmitting: false,
  finalizing: false,
  submitError: null,

  setExamSession: async (session) => {
    // If the incoming session differs from what's locally stored, the saved
    // answers belong to a different participant (or a previous exam on this
    // machine). Purge them before loading so cross-participant contamination
    // cannot occur.
    const storedSessionId = isBrowser ? localStorage.getItem("cbt_exam_session_id") : null;
    if (storedSessionId !== session.id) {
      await clearLocalDbAnswers();
    }

    // Capture clock skew from the server's clock at session creation so the
    // countdown stays aligned even if the local clock is wrong (#8).
    const offset = session.serverTime !== undefined ? session.serverTime - Date.now() : 0;
    if (isBrowser) {
      localStorage.setItem("cbt_exam_session_id", session.id);
      localStorage.setItem("cbt_exam_id", session.examId);
      localStorage.setItem("cbt_exam_title", session.examTitle);
      localStorage.setItem("cbt_total_questions", String(session.totalQuestions));
      localStorage.setItem("cbt_exam_start_time", String(session.startTime));
      localStorage.setItem("cbt_exam_end_time", String(session.endTime));
      localStorage.setItem("cbt_server_time_offset", String(offset));
    }
    set({
      examSessionId: session.id,
      examId: session.examId,
      examTitle: session.examTitle,
      totalQuestions: session.totalQuestions,
      startTime: session.startTime,
      endTime: session.endTime,
      serverTimeOffset: offset,
      timeRemaining: secondsUntil(session.endTime, offset),
      examResult: null,
    });
    await get().loadPersistedAnswers();
  },

  applyFinalizedResult: (result, examTitle) => {
    if (isBrowser) {
      localStorage.setItem("cbt_exam_title", examTitle);
    }
    set({ examResult: result, examTitle });
  },

  setQuestions: (questions) => {
    if (isBrowser) {
      localStorage.setItem("cbt_questions", JSON.stringify(questions));
    }
    set({ questions, totalQuestions: questions.length });
  },

  setCurrentQuestionIndex: (index) => {
    if (index >= 0 && index < get().questions.length) {
      if (isBrowser) {
        localStorage.setItem("cbt_current_question_index", String(index));
      }
      set({ currentQuestionIndex: index });
    }
  },

  submitAnswer: async (questionId, selectedOptionId, answerValue) => {
    const timestamp = Date.now();
    const newAnswer: ExamAnswer = {
      questionId,
      selectedOptionId,
      answerValue: answerValue ?? null,
      timestamp,
      isFlagged: !!get().flaggedQuestions[questionId],
    };

    set((state) => ({ answers: { ...state.answers, [questionId]: newAnswer } }));

    // Persist locally first (offline-first); storage layer never throws.
    await saveAnswerToLocalDb(newAnswer);

    // Debounce only the network write — local state/storage are already current.
    // Rapid option changes on the same question collapse into one POST.
    answerSyncDebouncer.schedule(questionId, () => {
      void pushAnswerToServer(questionId);
    });
  },

  toggleFlagQuestion: async (questionId) => {
    const isCurrentlyFlagged = !get().flaggedQuestions[questionId];

    set((state) => ({
      flaggedQuestions: { ...state.flaggedQuestions, [questionId]: isCurrentlyFlagged },
    }));

    const existingAnswer = get().answers[questionId];
    if (existingAnswer) {
      const updatedAnswer = {
        ...existingAnswer,
        isFlagged: isCurrentlyFlagged,
        timestamp: Date.now(),
      };
      set((state) => ({ answers: { ...state.answers, [questionId]: updatedAnswer } }));
      await saveAnswerToLocalDb(updatedAnswer);
    }
  },

  setTimeRemaining: (time) => {
    if (typeof time === "function") {
      set((state) => ({ timeRemaining: time(state.timeRemaining) }));
    } else {
      set({ timeRemaining: time });
    }
  },

  submitExam: async () => {
    set({ isSubmitting: true, submitError: null });
    const { examSessionId, examId, answers } = get();

    try {
      const allAnswers = Object.values(answers);

      const response = await api.post(`/exams/${examId}/submit`, {
        sessionId: examSessionId,
        answers: allAnswers,
      });
      const result: ExamResult = response.data;

      // Submit reconciled every answer (`allAnswers` is the in-memory superset,
      // including queued ones). Cancel pending debounced pushes and drop the
      // sync queue so nothing re-fires against the now-submitted session (#10).
      answerSyncDebouncer.cancelAll();
      useConnectivityStore.getState().clearPendingAnswers();

      // Clearing the local cache is best-effort and must not fail the submit.
      await clearLocalDbAnswers();

      set({ examResult: result, isSubmitting: false, submitError: null });
      return result;
    } catch (error) {
      const context = toErrorContext(error);
      log.error("Failed to submit exam", error, { examId, examSessionId, ...context });
      set({ isSubmitting: false, submitError: String(context.message) });
      return null;
    }
  },

  finalizeExam: async () => {
    // Already finalized or in flight — return the known result instead of
    // starting a second retry loop.
    if (get().examResult) return get().examResult;
    if (get().finalizing) return null;

    set({ finalizing: true });
    let delay = FINALIZE_BACKOFF_START_MS;

    // Retry until the server accepts the submit. The submit is idempotent
    // server-side (a re-submit of an already-finalized session returns its
    // score), so retrying after a timeout/offline window — or even after a
    // server-side finalize race — converges safely without double-scoring.
    // The Processing overlay keeps the UI locked for the whole loop.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await get().submitExam();
      if (result) {
        set({ finalizing: false });
        return result;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, FINALIZE_BACKOFF_MAX_MS);
    }
  },

  applyTimeChange: (endTime, serverTime) => {
    const offset = serverTime - Date.now();
    if (isBrowser) {
      localStorage.setItem("cbt_exam_end_time", String(endTime));
      localStorage.setItem("cbt_server_time_offset", String(offset));
    }
    set({
      endTime,
      serverTimeOffset: offset,
      timeRemaining: secondsUntil(endTime, offset),
    });
  },

  loadPersistedAnswers: async () => {
    try {
      const dbAnswers = await getAnswersFromLocalDb();
      const answersMap: Record<string, ExamAnswer> = {};
      const flagsMap: Record<string, boolean> = {};

      dbAnswers.forEach((ans) => {
        answersMap[ans.questionId] = ans;
        if (ans.isFlagged) flagsMap[ans.questionId] = true;
      });

      set({ answers: answersMap, flaggedQuestions: flagsMap });
    } catch (error) {
      // getAnswersFromLocalDb is defensive, but guard here too so a load failure
      // never blocks entering the exam.
      log.error("Failed to load persisted answers", error);
    }
  },

  resetExam: () => {
    answerSyncDebouncer.cancelAll();
    if (isBrowser) {
      SESSION_KEYS.forEach((k) => localStorage.removeItem(k));
    }
    set({
      examSessionId: null,
      examId: null,
      examTitle: null,
      totalQuestions: 0,
      questions: [],
      currentQuestionIndex: 0,
      answers: {},
      flaggedQuestions: {},
      startTime: null,
      endTime: null,
      serverTimeOffset: 0,
      timeRemaining: 0,
      examResult: null,
      isSubmitting: false,
      finalizing: false,
      submitError: null,
    });
  },

  restoreSession: () => {
    if (!isBrowser) return;

    const examSessionId = localStorage.getItem("cbt_exam_session_id");
    if (!examSessionId) return;

    const endTime = readNumber("cbt_exam_end_time") || null;
    const offset = readNumber("cbt_server_time_offset");

    set({
      examSessionId,
      examId: localStorage.getItem("cbt_exam_id"),
      examTitle: localStorage.getItem("cbt_exam_title"),
      totalQuestions: readNumber("cbt_total_questions"),
      questions: safeJsonParse<Question[]>(
        localStorage.getItem("cbt_questions"),
        [],
        "cbt_questions"
      ),
      currentQuestionIndex: readNumber("cbt_current_question_index"),
      startTime: readNumber("cbt_exam_start_time") || null,
      endTime,
      serverTimeOffset: offset,
      timeRemaining: secondsUntil(endTime, offset),
    });
  },
  };
});
