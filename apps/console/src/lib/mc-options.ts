/**
 * Azhura CBT Console — Multiple-choice option form-state helpers (#163).
 *
 * Pure, immutable list operations shared by the admin and supervisor question
 * forms. Each option carries inline-HTML `text` plus an optional attached
 * `imageUrl` (a media-library `/uploads/...` path; null when text-only).
 * Keeping these side-effect-free makes the per-option image state (set/clear)
 * unit-testable without a DOM.
 */

import type { AdminOption } from "../types";

/** One option row as edited in the question form (no persisted id yet). */
export interface McOptionDraft {
  /** Inline HTML produced by the InlineEditor. */
  text: string;
  /** Attached image as a `/uploads/...` media path; null when none. */
  imageUrl: string | null;
}

/** Empty TipTap paragraph — the editor's "blank" value. */
export const EMPTY_OPTION_HTML = "<p></p>";

/** A fresh, blank option row. */
export function createEmptyOption(): McOptionDraft {
  return { text: EMPTY_OPTION_HTML, imageUrl: null };
}

/** The default four blank options shown on a new multiple-choice question. */
export function createDefaultOptions(): McOptionDraft[] {
  return Array.from({ length: 4 }, createEmptyOption);
}

/**
 * Maps persisted options (edit mode) into form drafts, capping at `max` and
 * padding with blanks up to `min` so the form always shows a valid row count.
 */
export function hydrateOptions(
  persisted: Pick<AdminOption, "text" | "imageUrl">[],
  min: number,
  max: number
): McOptionDraft[] {
  const drafts = persisted.slice(0, max).map((o) => ({
    text: o.text || EMPTY_OPTION_HTML,
    imageUrl: o.imageUrl ?? null,
  }));
  while (drafts.length < min) drafts.push(createEmptyOption());
  return drafts;
}

/** Returns a new list with the text of option `idx` replaced. */
export function updateOptionText(
  list: McOptionDraft[],
  idx: number,
  text: string
): McOptionDraft[] {
  return list.map((o, i) => (i === idx ? { ...o, text } : o));
}

/** Returns a new list with an image attached to option `idx`. */
export function setOptionImage(
  list: McOptionDraft[],
  idx: number,
  imageUrl: string
): McOptionDraft[] {
  return list.map((o, i) => (i === idx ? { ...o, imageUrl } : o));
}

/** Returns a new list with the image of option `idx` removed. */
export function clearOptionImage(list: McOptionDraft[], idx: number): McOptionDraft[] {
  return list.map((o, i) => (i === idx ? { ...o, imageUrl: null } : o));
}

/** Appends a blank option unless the list is already at `max`. */
export function appendOption(list: McOptionDraft[], max: number): McOptionDraft[] {
  return list.length >= max ? list : [...list, createEmptyOption()];
}

/** Removes option `idx` unless the list is already at `min`. */
export function removeOptionAt(
  list: McOptionDraft[],
  idx: number,
  min: number
): McOptionDraft[] {
  if (list.length <= min) return list;
  return list.filter((_, i) => i !== idx);
}

/**
 * Re-derives the correct-answer index after removing option `removedIdx`:
 * resets to 0 when the removed option WAS the answer, shifts left when an
 * earlier option was removed, otherwise unchanged.
 */
export function adjustCorrectIndexAfterRemove(
  correctIndex: number,
  removedIdx: number
): number {
  if (removedIdx === correctIndex) return 0;
  return removedIdx < correctIndex ? correctIndex - 1 : correctIndex;
}

/** Serializes drafts into the request payload shape for create/update. */
export function toOptionPayload(
  list: McOptionDraft[]
): { text: string; imageUrl: string | null }[] {
  return list.map((o) => ({ text: o.text, imageUrl: o.imageUrl }));
}
