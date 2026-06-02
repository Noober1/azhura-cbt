/**
 * Azhura CBT App - Connectivity & Background Sync Store (Zustand)
 *
 * Tracks online/offline status and holds a queue of answers that could not be
 * delivered to the server (because the device was offline or a request failed).
 * When connectivity is restored, queued answers are flushed automatically;
 * any that still fail remain queued for the next attempt.
 */

import { create } from "zustand";
import { ExamAnswer } from "../types";
import api from "../lib/api";
import { createLogger } from "../lib/logger";
import { toErrorContext } from "../lib/errors";

const log = createLogger("Connectivity");

interface ConnectivityState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingAnswers: ExamAnswer[];
  /** Updates online status; triggers a sync when transitioning offline→online. */
  setOnline: (online: boolean) => void;
  /** Enqueues an answer for later delivery (deduped by questionId). */
  addPendingAnswer: (answer: ExamAnswer) => void;
  /** Attempts to deliver all queued answers; keeps the ones that fail. */
  syncAnswers: () => Promise<void>;
}

export const useConnectivityStore = create<ConnectivityState>((set, get) => ({
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  isSyncing: false,
  pendingAnswers: [],

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
    if (!isOnline || isSyncing || pendingAnswers.length === 0) return;

    // Import lazily to avoid a circular dependency with the exam store.
    const { useExamStore } = await import("./exam");
    const { examId, examSessionId } = useExamStore.getState();
    if (!examId || !examSessionId) {
      log.warn("Cannot sync answers: no active exam session.");
      return;
    }

    set({ isSyncing: true });

    const failed: ExamAnswer[] = [];
    for (const answer of pendingAnswers) {
      try {
        await api.post(`/exams/${examId}/answer`, {
          sessionId: examSessionId,
          questionId: answer.questionId,
          selectedOptionId: answer.selectedOptionId ?? null,
          timestamp: answer.timestamp,
        });
      } catch (error) {
        log.warn("Answer re-sync failed — keeping in queue", {
          questionId: answer.questionId,
          ...toErrorContext(error),
        });
        failed.push(answer);
      }
    }

    if (failed.length > 0) {
      log.warn("Sync completed with failures", {
        failed: failed.length,
        total: pendingAnswers.length,
      });
    } else {
      log.info("All pending answers synced.", { synced: pendingAnswers.length });
    }

    set({ pendingAnswers: failed, isSyncing: false });
  },
}));

// Bind browser connectivity events to the store so sync is automatic.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => useConnectivityStore.getState().setOnline(true));
  window.addEventListener("offline", () => useConnectivityStore.getState().setOnline(false));
}
