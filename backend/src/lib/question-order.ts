/**
 * Azhura CBT Backend - Question / Option Ordering Helpers (#2)
 *
 * Pure helpers (no I/O, no throwing) for exam randomization, so they are
 * trivially unit-tested. The exam routes wire them to the DB:
 * - `shuffle` randomizes question order at first session start and answer
 *   options at serve time (Fisher-Yates, unbiased).
 * - `applyQuestionOrder` reconciles a session's persisted question order with
 *   the exam's current questions, staying correct if questions were added or
 *   removed after the order was generated.
 */

/**
 * Returns a new array with the elements of `items` in random order.
 * Pure: the input is never mutated. Uses an unbiased Fisher-Yates shuffle.
 */
export const shuffle = <T>(items: readonly T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * Orders the exam's current question ids by a session's persisted order.
 *
 * Persisted ids are honored first (in stored order), skipping any whose
 * question no longer exists and any duplicates. Questions present in the exam
 * but absent from the persisted order are appended in their canonical order
 * (so newly added questions still surface). When `persistedOrder` is empty the
 * canonical order is returned unchanged.
 *
 * @param canonical    Current question ids in their fallback order (`order_index`).
 * @param persistedOrder Stored question ids for this session (may be stale/empty).
 */
export const applyQuestionOrder = (
  canonical: readonly string[],
  persistedOrder: readonly string[]
): string[] => {
  const existing = new Set(canonical);
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const id of persistedOrder) {
    if (existing.has(id) && !seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }

  for (const id of canonical) {
    if (!seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }

  return ordered;
};
