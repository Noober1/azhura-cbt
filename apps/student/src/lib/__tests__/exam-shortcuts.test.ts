import { describe, it, expect } from "vitest";
import {
  resolveExamShortcut,
  isEditableTarget,
  isArrowConsumerTarget,
  type ExamShortcutKey,
  type ExamShortcutContext,
} from "../exam-shortcuts";

/**
 * `resolveExamShortcut` is the pure decision table behind the exam keyboard
 * shortcuts (#178). The guards verified here are load-bearing: a wrong `null`
 * strands the shortcut, a wrong action fires while a student is typing or a
 * dialog is open. Pure + DOM-free, matching the node vitest env.
 */

/** Builds a plain key press, then applies overrides. */
const key = (k: string, overrides: Partial<ExamShortcutKey> = {}): ExamShortcutKey => ({
  key: k,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  ...overrides,
});

/** Builds a mid-exam multiple-choice context, then applies overrides. */
const ctx = (overrides: Partial<ExamShortcutContext> = {}): ExamShortcutContext => ({
  currentQuestionIndex: 2,
  questionCount: 10,
  optionCount: 4,
  isEditableFocused: false,
  isArrowConsumerFocused: false,
  isOverlayOpen: false,
  ...overrides,
});

describe("resolveExamShortcut — arrow navigation", () => {
  it("ArrowRight navigates to the next question", () => {
    expect(resolveExamShortcut(key("ArrowRight"), ctx())).toEqual({
      type: "navigate",
      targetIndex: 3,
    });
  });

  it("ArrowLeft navigates to the previous question", () => {
    expect(resolveExamShortcut(key("ArrowLeft"), ctx())).toEqual({
      type: "navigate",
      targetIndex: 1,
    });
  });

  it("ArrowLeft on the first question does nothing", () => {
    expect(resolveExamShortcut(key("ArrowLeft"), ctx({ currentQuestionIndex: 0 }))).toBeNull();
  });

  it("ArrowRight on the last question does nothing", () => {
    expect(
      resolveExamShortcut(key("ArrowRight"), ctx({ currentQuestionIndex: 9, questionCount: 10 }))
    ).toBeNull();
  });

  it("arrows are suppressed while a text input is focused (caret movement)", () => {
    expect(resolveExamShortcut(key("ArrowRight"), ctx({ isEditableFocused: true }))).toBeNull();
    expect(resolveExamShortcut(key("ArrowLeft"), ctx({ isEditableFocused: true }))).toBeNull();
  });

  it("arrows are suppressed while focus is on a dnd handle / radio item", () => {
    // dnd-kit keyboard reorder and radio roving focus own the arrow keys.
    expect(
      resolveExamShortcut(key("ArrowRight"), ctx({ isArrowConsumerFocused: true }))
    ).toBeNull();
    expect(
      resolveExamShortcut(key("ArrowLeft"), ctx({ isArrowConsumerFocused: true }))
    ).toBeNull();
  });
});

describe("resolveExamShortcut — option letters A–F", () => {
  it("maps A and F to option indices (case-insensitive)", () => {
    expect(resolveExamShortcut(key("a"), ctx({ optionCount: 6 }))).toEqual({
      type: "select-option",
      optionIndex: 0,
    });
    expect(resolveExamShortcut(key("F"), ctx({ optionCount: 6 }))).toEqual({
      type: "select-option",
      optionIndex: 5,
    });
  });

  it("is limited to the question's actual option count", () => {
    expect(resolveExamShortcut(key("d"), ctx({ optionCount: 3 }))).toBeNull();
    expect(resolveExamShortcut(key("c"), ctx({ optionCount: 3 }))).toEqual({
      type: "select-option",
      optionIndex: 2,
    });
  });

  it("does nothing for non-multiple-choice questions (optionCount 0)", () => {
    expect(resolveExamShortcut(key("a"), ctx({ optionCount: 0 }))).toBeNull();
  });

  it("ignores letters beyond F", () => {
    expect(resolveExamShortcut(key("g"), ctx({ optionCount: 6 }))).toBeNull();
    expect(resolveExamShortcut(key("z"), ctx())).toBeNull();
  });

  it("ignores letters while a text input is focused (typing)", () => {
    expect(resolveExamShortcut(key("a"), ctx({ isEditableFocused: true }))).toBeNull();
  });
});

describe("resolveExamShortcut — flag toggle (R)", () => {
  it("toggles the flag with lower- and uppercase R", () => {
    expect(resolveExamShortcut(key("r"), ctx())).toEqual({ type: "toggle-flag" });
    expect(resolveExamShortcut(key("R"), ctx())).toEqual({ type: "toggle-flag" });
  });

  it("is suppressed while a text input is focused", () => {
    expect(resolveExamShortcut(key("r"), ctx({ isEditableFocused: true }))).toBeNull();
  });
});

describe("resolveExamShortcut — modifier and overlay guards", () => {
  it("ignores any key with ctrl/alt/meta held (anti-cheat blocker territory)", () => {
    expect(resolveExamShortcut(key("a", { ctrlKey: true }), ctx())).toBeNull();
    expect(resolveExamShortcut(key("ArrowRight", { altKey: true }), ctx())).toBeNull();
    expect(resolveExamShortcut(key("r", { metaKey: true }), ctx())).toBeNull();
  });

  it("ignores shifted keys (Shift+Arrow = selection, Shift+letter = typing intent)", () => {
    expect(resolveExamShortcut(key("A", { shiftKey: true }), ctx())).toBeNull();
    expect(resolveExamShortcut(key("R", { shiftKey: true }), ctx())).toBeNull();
    expect(resolveExamShortcut(key("ArrowRight", { shiftKey: true }), ctx())).toBeNull();
  });

  it("suspends every shortcut while an overlay/dialog is open", () => {
    const overlay = ctx({ isOverlayOpen: true });
    expect(resolveExamShortcut(key("ArrowRight"), overlay)).toBeNull();
    expect(resolveExamShortcut(key("a"), overlay)).toBeNull();
    expect(resolveExamShortcut(key("r"), overlay)).toBeNull();
  });

  it("ignores non-shortcut keys", () => {
    expect(resolveExamShortcut(key("Enter"), ctx())).toBeNull();
    expect(resolveExamShortcut(key("Escape"), ctx())).toBeNull();
    expect(resolveExamShortcut(key("F12"), ctx())).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("detects inputs, textareas, and contenteditable elements", () => {
    expect(isEditableTarget({ tagName: "INPUT", isContentEditable: false })).toBe(true);
    expect(isEditableTarget({ tagName: "TEXTAREA", isContentEditable: false })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("rejects regular elements and null", () => {
    expect(isEditableTarget({ tagName: "BUTTON", isContentEditable: false })).toBe(false);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: false })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("isArrowConsumerTarget", () => {
  it("matches elements inside a dnd-kit sortable handle or radio item", () => {
    const insideDnd = {
      closest: (selector: string) =>
        selector.includes('[aria-roledescription="sortable"]') ? {} : null,
    };
    expect(isArrowConsumerTarget(insideDnd)).toBe(true);
  });

  it("rejects elements outside arrow-consuming widgets and null", () => {
    expect(isArrowConsumerTarget({ closest: () => null })).toBe(false);
    expect(isArrowConsumerTarget(null)).toBe(false);
  });
});
