import type { FillInBlankConfig, MatchingConfig, SortingConfig } from "@azhura/shared";

/**
 * Grades a fill-in-blank answer against the correct answer.
 * Case-insensitive, whitespace-trimmed exact match.
 */
export function gradeFillInBlank(answer: string, config: FillInBlankConfig): boolean {
  return answer.trim().toLowerCase() === config.answer.trim().toLowerCase();
}

/**
 * Grades a matching answer. Student encodes their answer as an array of
 * [leftIndex, rightIndex] pairs. The correct mapping is left[i] → right[i]
 * (i.e. pair i from config.pairs is correctly matched when leftIndex === rightIndex).
 * Returns true when more than 50% of pairs are correctly matched.
 */
export function gradeMatching(
  answer: [number, number][],
  config: MatchingConfig
): boolean {
  if (!answer.length || !config.pairs.length) return false;
  const hits = answer.filter(([l, r]) => l === r).length;
  return hits / config.pairs.length > 0.5;
}

/**
 * Grades a sorting answer. Student sends an array of original indices in the
 * order they arranged them. The correct order is config.correctOrder.
 * Returns true when more than 50% of positions match.
 */
export function gradeSorting(answer: number[], config: SortingConfig): boolean {
  const correct = config.correctOrder;
  if (!answer.length || answer.length !== correct.length) return false;
  const hits = answer.filter((v, i) => v === correct[i]).length;
  return hits / correct.length > 0.5;
}
