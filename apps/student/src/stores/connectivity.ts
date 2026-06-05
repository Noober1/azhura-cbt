/**
 * Azhura CBT App - Connectivity & Background Sync Store (Zustand)
 *
 * Tracks online/offline status and holds a queue of answers that could not be
 * delivered to the server (because the device was offline or a request failed).
 *
 * Flush strategy (#10):
 * - Queued answers are flushed in a single idempotent **batch** request
 *   (`POST /exams/:examId/answers/batch`) rather than one request per answer.
 * - A flush is triggered on three signals: browser `online`, socket reconnect
 *   (see `lib/socket.ts`), and an internal exponential-backoff retry while the
 *   queue stays non-empty.
 * - Terminal failures (session submitted → 409, exam expired → 410) drop the
 *   queue instead of retrying forever; everything else is retried.
 */

import { create } from "zustand";
import { isAxiosError } from "axios";
import { ExamAnswer } from "../types";
import api from "../lib/api";
import { createLogger } from "../lib/logger";
import { toErrorContext } from "../lib/errors";
import { nextBackoffDelay } from "../lib/backoff";
import { classifyFlushFailure } from "../lib/sync-policy";

const log = createLogger("Connectivity");

/** Single in-flight backoff timer; module-scoped so we never stack retries. */
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const clearRetryTimer = (): void => {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
};

interface ConnectivityState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingAnswers: ExamAnswer[];
  /** Consecutive failed-flush count, drives the backoff delay. */
  retryAttempt: number;
  /** Updates online status; triggers a sync when transitioning offline→online. */
  setOnline: (online: boolean) => void;
  /** Enqueues an answer for later delivery (deduped by questionId). */
  addPendingAnswer: (answer: ExamAnswer) => void;
  /** Attempts to deliver all queued answers as one batch; keeps them on failure. */
  syncAnswers: () => Promise<void>;
  /** Empties the queue and cancels any pending retry (e.g. after final submit). */
  clearPendingAnswers: () => void;
}

export const useConnectivityStore = create<ConnectivityState>((set, get) => {
  /** Reschedules a flush with capped exponential backoff (one timer at a time). */
  const scheduleRetry = (): void => {
    if (retryTimer !== null) return;
    const delay = nextBackoffDelay(get().retryAttempt);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      set((state) => ({ retryAttempt: state.retryAttempt + 1 }));
      void get().syncAnswers();
    }, delay);
  };

  return {
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    isSyncing: false,
    pendingAnswers: [],
    retryAttempt: 0,

    setOnline: (online) => {
      const wasOffline = !get().isOnline;
      set({ isOnline: online });
      if (online && wasOffline && get().pendingAnswers.length > 0) {
        log.info("Back online — flushing pending answers", {
          pending: get().pendingAnswers.length,
        });
        void get().syncAnswers();
      }
    },

    addPendingAnswer: (answer) => {
      set((state) => ({
        pendingAnswers: [
          ...state.pendingAnswers.filter((a) => a.questionId !== answer.questionId),
          answer,
        ],
      }));
    },

    syncAnswers: async () => {
      const { isOnline, isSyncing, pendingAnswers } = get();
      if (isSyncing || pendingAnswers.length === 0) {
        // Nothing to send — make sure no stale retry keeps ticking.
        if (pendingAnswers.length === 0) {
          clearRetryTimer();
          if (get().retryAttempt !== 0) set({ retryAttempt: 0 });
        }
        return;
      }
      if (!isOnline) return;

      // Import lazily to avoid a circular dependency with the exam store.
      const { useExamStore } = await import("./exam");
      const { examId, examSessionId } = useExamStore.getState();
      if (!examId || !examSessionId) {
        log.warn("Cannot sync answers: no active exam session.");
        return;
      }

      set({ isSyncing: true });

      // Snapshot what we're flushing; answers may change mid-request.
      const batch = pendingAnswers;
      const flushed = new Map(batch.map((a) => [a.questionId, a.timestamp]));

      try {
        await api.post(`/exams/${examId}/answers/batch`, {
          sessionId: examSessionId,
          answers: batch.map((a) => ({
            questionId: a.questionId,
            selectedOptionId: a.selectedOptionId ?? null,
            timestamp: a.timestamp,
          })),
        });

        clearRetryTimer();
        // Drop the flushed entries, but keep any newer answer that landed for the
        // same question while the request was in flight (larger timestamp wins).
        set((state) => ({
          pendingAnswers: state.pendingAnswers.filter((a) => {
            const sentTs = flushed.get(a.questionId);
            return sentTs === undefined || a.timestamp > sentTs;
          }),
          isSyncing: false,
          retryAttempt: 0,
        }));
        log.info("Pending answers flushed.", { synced: batch.length });
      } catch (error) {
        const status = isAxiosError(error) ? error.response?.status : undefined;
        set({ isSyncing: false });

        if (classifyFlushFailure(status) === "drop") {
          // Session submitted/expired — the server will never accept these. Stop
          // retrying so we don't pin the queue open against a dead session.
          log.warn("Flush rejected as terminal — dropping queue", {
            status,
            dropped: get().pendingAnswers.length,
            ...toErrorContext(error),
          });
          get().clearPendingAnswers();
          return;
        }

        log.warn("Batch flush failed — will retry with backoff", {
          pending: get().pendingAnswers.length,
          attempt: get().retryAttempt,
          ...toErrorContext(error),
        });
        scheduleRetry();
      }
    },

    clearPendingAnswers: () => {
      clearRetryTimer();
      set({ pendingAnswers: [], retryAttempt: 0 });
    },
  };
});

// Bind browser connectivity events to the store so sync is automatic.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => useConnectivityStore.getState().setOnline(true));
  window.addEventListener("offline", () => useConnectivityStore.getState().setOnline(false));
}
