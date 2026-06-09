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
    <div className="flex-1 flex flex-col gap-6 p-6 rounded-2xl border border-neutral-200/60 bg-white dark:border-neutral-800/60 dark:bg-neutral-900 shadow-sm">
      <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-neutral-800">
        <span className="text-sm font-semibold uppercase tracking-wider text-primary bg-primary/5 px-3 py-1 rounded-full">
          Isi Jawaban
        </span>
        <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">
          Nomor {questionNumber} dari {useExamStore.getState().questions.length}
        </span>
      </div>

      <RichContent
        html={question.text}
        className="question-html text-lg font-medium text-neutral-900 dark:text-neutral-100 leading-relaxed"
      />

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Jawaban kamu:
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          placeholder="Ketik jawaban di sini…"
          className="w-full rounded-xl border-2 border-neutral-200 bg-neutral-50 px-4 py-3 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-primary focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-primary"
        />
      </div>
    </div>
  );
}
