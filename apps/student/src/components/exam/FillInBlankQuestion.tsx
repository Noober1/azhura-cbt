import { useState, useEffect, useRef } from "react";
import { CornerDownLeft } from "lucide-react";
import type { Question } from "../../types";
import { useExamStore } from "../../stores/exam";
import { RichContent } from "./RichContent";

interface Props {
  question: Question;
  questionNumber: number;
}

export function FillInBlankQuestion({ question, questionNumber }: Props) {
  const { answers, submitAnswer } = useExamStore();
  const savedValue = answers[question.id]?.answerValue ?? "";
  const [value, setValue] = useState(savedValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync if answer is cleared externally (e.g. session reset).
  useEffect(() => {
    setValue(savedValue);
  }, [savedValue]);

  // Auto-focus when this question opens so the student can type right away
  // (#178). Keyed on question.id: the component instance is reused when
  // navigating between two consecutive fill-in-blank questions.
  useEffect(() => {
    inputRef.current?.focus();
  }, [question.id]);

  function handleBlur() {
    void submitAnswer(question.id, null, value.trim() || null);
  }

  // Enter = save & release focus (#178). The blur triggers handleBlur — the
  // single existing save path — and frees the arrow/letter shortcuts again.
  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  }

  // Clickable ↵ affordance: same save path as Enter, exactly once. While the
  // input holds focus, blur() fires onBlur → handleBlur; only when it is
  // already blurred do we call handleBlur directly.
  function handleSaveClick() {
    const input = inputRef.current;
    if (input && document.activeElement === input) {
      input.blur();
    } else {
      handleBlur();
    }
  }

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 rounded-2xl border-[2.5px] border-[var(--nb-ink)] bg-white shadow-[3px_3px_0_var(--nb-ink)]">
      <div className="flex items-center justify-between pb-4 border-b border-soft">
        <span className="text-sm font-semibold uppercase tracking-wider text-primary bg-primary/5 px-3 py-1 rounded-full">
          Isi Jawaban
        </span>
        <span className="text-sm font-bold text-muted-foreground">
          Nomor {questionNumber} dari {useExamStore.getState().questions.length}
        </span>
      </div>

      <RichContent
        html={question.text}
        className="question-html text-lg font-medium text-foreground leading-relaxed"
      />

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground">
          Jawaban kamu:
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="Ketik jawaban di sini…"
            className="w-full rounded-xl border-2 border-soft bg-muted/50 px-4 py-3 pr-14 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-white focus:outline-none dark:border-soft dark:placeholder:text-muted-foreground dark:focus:border-primary"
          />
          <button
            type="button"
            // Keep focus on the input through the click: without this the
            // mousedown blurs the input (save #1) and onClick would save again.
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSaveClick}
            aria-label="Simpan jawaban (Enter)"
            title="Simpan jawaban (Enter)"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-lg border-2 border-[var(--nb-ink)] bg-white text-foreground shadow-[1px_1px_0_var(--nb-ink)] transition-all hover:bg-muted active:translate-x-px active:translate-y-px active:shadow-none"
          >
            <CornerDownLeft className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <p className="text-xs font-medium text-muted-foreground">
          Tekan Enter atau tombol ↵ untuk menyimpan jawaban.
        </p>
      </div>
    </div>
  );
}
