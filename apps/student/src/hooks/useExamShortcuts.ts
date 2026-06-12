import { useEffect } from "react";
import { useExamStore } from "../stores/exam";
import {
  resolveExamShortcut,
  isEditableTarget,
  isArrowConsumerTarget,
} from "../lib/exam-shortcuts";

interface UseExamShortcutsOptions {
  /**
   * True while any blocking layer is open (submit confirmation, processing
   * overlay, help dialog) — all shortcuts are suspended.
   */
  overlayOpen: boolean;
}

/**
 * Wires the exam keyboard shortcuts (#178) to the exam store: ←/→ navigate,
 * A–F pick a multiple-choice option, R toggles "ragu-ragu". All guard logic
 * lives in {@link resolveExamShortcut}; this hook only reads the live DOM/store
 * state and dispatches the resolved action. Mounted once by ExamLayout.
 */
export function useExamShortcuts({ overlayOpen }: UseExamShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Read store state at event time (not render time) so rapid key presses
      // always act on the latest question/index.
      const state = useExamStore.getState();
      const question = state.questions[state.currentQuestionIndex];
      if (!question) return;

      const type = question.type ?? "multiple_choice";
      const active = document.activeElement;

      const action = resolveExamShortcut(
        {
          key: event.key,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
        },
        {
          currentQuestionIndex: state.currentQuestionIndex,
          questionCount: state.questions.length,
          optionCount: type === "multiple_choice" ? question.options.length : 0,
          isEditableFocused: isEditableTarget(active),
          isArrowConsumerFocused: isArrowConsumerTarget(active),
          isOverlayOpen: overlayOpen,
        }
      );
      if (!action) return;

      event.preventDefault();
      switch (action.type) {
        case "navigate":
          state.setCurrentQuestionIndex(action.targetIndex);
          break;
        case "select-option": {
          const option = question.options[action.optionIndex];
          if (option) void state.submitAnswer(question.id, option.id);
          break;
        }
        case "toggle-flag":
          void state.toggleFlagQuestion(question.id);
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [overlayOpen]);
}
