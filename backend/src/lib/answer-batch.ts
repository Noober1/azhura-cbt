/**
 * Azhura CBT Backend - Answer Batch Normalization (#10 autosave)
 *
 * Side-effect-free core for the batch upsert endpoint
 * (`POST /api/exams/:examId/answers/batch`). The client flushes its offline
 * queue as an array; before persisting we collapse it so each question maps to
 * exactly one row — keeping the latest answer per question (by timestamp).
 *
 * Idempotency itself is guaranteed by the DB (`uq_session_question` unique
 * index + `onDuplicateKeyUpdate`); this function just removes intra-batch
 * duplicates so a single transaction does not write the same `(session,
 * question)` pair twice. Kept pure so it can be unit-tested in isolation,
 * mirroring `heartbeat.ts` / `time-control.ts`.
 */

/** One answer as received from the client batch flush. */
export interface RawBatchAnswer {
  questionId: string;
  selectedOptionId: string | null;
  timestamp: number;
}

/**
 * Collapses a batch so each `questionId` appears once, keeping the entry with
 * the greatest `timestamp` (the most recent answer wins). Ties keep the
 * later-listed entry. Input order of first appearance is preserved for the
 * surviving entries, making the result deterministic.
 *
 * @param answers Raw answers from the client (may contain duplicates).
 * @returns Deduplicated answers, one per question, `selectedOptionId` coerced
 *          to `null` when absent.
 */
export const dedupeAnswersByQuestion = (
  answers: readonly RawBatchAnswer[]
): RawBatchAnswer[] => {
  // Track insertion order so output is stable regardless of which duplicate wins.
  const order: string[] = [];
  const latest = new Map<string, RawBatchAnswer>();

  for (const answer of answers) {
    const normalized: RawBatchAnswer = {
      questionId: answer.questionId,
      selectedOptionId: answer.selectedOptionId ?? null,
      timestamp: answer.timestamp,
    };

    const existing = latest.get(answer.questionId);
    if (!existing) {
      order.push(answer.questionId);
      latest.set(answer.questionId, normalized);
      continue;
    }

    // Most recent answer wins; ties favour the later entry in the list.
    if (normalized.timestamp >= existing.timestamp) {
      latest.set(answer.questionId, normalized);
    }
  }

  return order.map((questionId) => latest.get(questionId)!);
};
