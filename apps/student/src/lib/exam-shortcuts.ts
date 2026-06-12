/**
 * Pure keyboard-shortcut resolution for the exam screen (#178).
 *
 * `resolveExamShortcut` maps a raw key press + the current exam context to a
 * declarative action (or `null` when the press must be ignored). Keeping the
 * decision table pure and DOM-free makes every guard unit-testable in the
 * node vitest env; the `useExamShortcuts` hook owns the DOM wiring.
 *
 * Shortcuts: ←/→ navigate questions, A–F select a multiple-choice option,
 * R toggles "ragu-ragu", Enter is handled locally by FillInBlankQuestion.
 */

/** Action produced by a recognized shortcut. */
export type ExamShortcutAction =
  | { type: "navigate"; targetIndex: number }
  | { type: "select-option"; optionIndex: number }
  | { type: "toggle-flag" };

/** The subset of KeyboardEvent the resolver needs. */
export interface ExamShortcutKey {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** Exam context snapshot used to validate a shortcut. */
export interface ExamShortcutContext {
  currentQuestionIndex: number;
  questionCount: number;
  /** `options.length` for multiple choice; 0 for other question types. */
  optionCount: number;
  /** Focus is inside an input/textarea/contenteditable — typing, not shortcuts. */
  isEditableFocused: boolean;
  /**
   * Focus is on an element that consumes arrow keys itself: a dnd-kit sortable
   * handle (arrows = keyboard reorder) or a radio item (arrows = roving focus).
   */
  isArrowConsumerFocused: boolean;
  /** Any blocking layer open: submit confirm, processing overlay, help dialog. */
  isOverlayOpen: boolean;
}

/** Option shortcuts span A–F only, regardless of how many options exist. */
const MAX_OPTION_KEYS = 6;

/** True when the element receives text input (letter shortcuts must not fire). */
export function isEditableTarget(
  el: { tagName?: string; isContentEditable?: boolean } | null
): boolean {
  if (!el) return false;
  const tag = el.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable === true;
}

/**
 * True when the focused element (or an ancestor) already uses arrow keys:
 * dnd-kit spreads `aria-roledescription="sortable"` on its drag handles and
 * keeps focus there during a keyboard drag (arrows = reorder), and Radix radio
 * items use arrows for roving selection. Question navigation must yield.
 */
export function isArrowConsumerTarget(
  el: { closest?: (selector: string) => unknown } | null
): boolean {
  return Boolean(el?.closest?.('[aria-roledescription="sortable"], [role="radio"]'));
}

/** Resolves a key press to an exam action, or `null` when it must be ignored. */
export function resolveExamShortcut(
  key: ExamShortcutKey,
  ctx: ExamShortcutContext
): ExamShortcutAction | null {
  if (ctx.isOverlayOpen) return null;
  // Plain keys only — modifier combos (incl. Shift+Arrow text selection and
  // Shift+letter capitalization) belong to the anti-cheat blocker
  // (matchBlockedShortcut) and to native browser/OS behavior.
  if (key.ctrlKey || key.altKey || key.metaKey || key.shiftKey) return null;

  if (key.key === "ArrowRight" || key.key === "ArrowLeft") {
    // Arrows inside a text field move the caret; inside a dnd handle/radio
    // group they reorder/re-select. Both must win over question navigation.
    if (ctx.isEditableFocused || ctx.isArrowConsumerFocused) return null;
    const targetIndex = ctx.currentQuestionIndex + (key.key === "ArrowRight" ? 1 : -1);
    if (targetIndex < 0 || targetIndex >= ctx.questionCount) return null;
    return { type: "navigate", targetIndex };
  }

  // Letter shortcuts never fire while typing.
  if (ctx.isEditableFocused) return null;
  if (key.key.length !== 1) return null;

  const letter = key.key.toUpperCase();
  if (letter === "R") return { type: "toggle-flag" };

  const optionIndex = letter.charCodeAt(0) - 65; // 'A' → 0 … 'F' → 5
  if (optionIndex >= 0 && optionIndex < MAX_OPTION_KEYS && optionIndex < ctx.optionCount) {
    return { type: "select-option", optionIndex };
  }
  return null;
}
