import { useState, useEffect } from "react";
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

  // Sync if answer is cleared externally (e.g. session reset).
  useEffect(() => {
    setValue(savedValue);
  }, [savedValue]);

  function handleBlur() {
    void submitAnswer(question.id, null, value.trim() || null);
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
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          placeholder="Ketik jawaban di sini…"
          className="w-full rounded-xl border-2 border-soft bg-muted/50 px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-white focus:outline-none dark:border-soft dark:placeholder:text-muted-foreground dark:focus:border-primary"
        />
      </div>
    </div>
  );
}
