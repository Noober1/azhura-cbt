import type { FillInBlankConfig, SortingConfig } from "@azhura/shared";

/**
 * Grades a fill-in-blank answer against one or more correct answers.
 * Case-insensitive, whitespace-trimmed exact match against every candidate.
 *
 * Backward compatible: if `config.answers` is absent or empty, falls back to
 * `config.answer` so existing questions without `answers` still grade correctly.
 */
export function gradeFillInBlank(answer: string, config: FillInBlankConfig): boolean {
  if (!answer) return false;
  const normalized = answer.trim().toLowerCase();
  const list = Array.isArray(config.answers) && config.answers.length
    ? config.answers
    : config.answer
    ? [config.answer]
    : [];
  // Tolerate a malformed config: only compare string candidates.
  return list.some((c) => typeof c === "string" && c.trim().toLowerCase() === normalized);
}

/**
 * Grades a matching answer against a secret per-session permutation.
 *
 * The student sees the left column in authored order and the right column
 * shuffled by `perm` (`right[k]` is the authored partner of `left[perm[k]]`).
 * They submit `[leftIndex, rightDisplayIndex]` pairs, so a pair `[l, k]` is
 * correct exactly when `perm[k] === l`. Because `perm` is derived from a
 * server secret the client cannot see, a blind identity submission scores only
 * by chance. Returns true when more than 50% of pairs are correctly matched.
 *
 * @param perm Permutation from {@link sessionPermutation} for this question.
 */
export function gradeMatching(answer: [number, number][], perm: number[]): boolean {
  if (!answer.length || !perm.length) return false;
  const hits = answer.filter(([l, k]) => perm[k] === l).length;
  return hits / perm.length > 0.5;
}

/**
 * Grades a sorting answer against a secret per-session permutation.
 *
 * The student sees `items` shuffled by `perm` (display position `k` holds the
 * item whose original index is `perm[k]`) and submits their arrangement as an
 * array of display indices — `answer[j]` is the display index placed at
 * position `j`. Position `j` should hold original index `config.correctOrder[j]`,
 * so it is correct when `perm[answer[j]] === config.correctOrder[j]`. Returns
 * true when more than 50% of positions match.
 *
 * @param perm Permutation from {@link sessionPermutation} for this question.
 */
export function gradeSorting(
  answer: number[],
  config: SortingConfig,
  perm: number[]
): boolean {
  const correct = config.correctOrder;
  if (!answer.length || answer.length !== perm.length || perm.length !== correct.length) {
    return false;
  }
  const hits = answer.filter((d, j) => perm[d] === correct[j]).length;
  return hits / correct.length > 0.5;
}
