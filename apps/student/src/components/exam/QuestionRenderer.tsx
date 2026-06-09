import { Question } from "../../types";
import { useExamStore } from "../../stores/exam";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { RichContent } from "./RichContent";
import "../../styles/question-renderer.css";

interface QuestionRendererProps {
  /** The question to display. */
  question: Question;
  /** 1-based position of this question, shown as "Nomor N dari M". */
  questionNumber: number;
}

/**
 * Renders a single multiple-choice question with selectable options (A, B, C…).
 * Selecting an option persists the answer via the exam store's `submitAnswer`.
 * Question text and option text are HTML from the WYSIWYG editor (TipTap + KaTeX).
 */
export const QuestionRenderer = ({ question, questionNumber }: QuestionRendererProps) => {
  const { answers, submitAnswer } = useExamStore();
  const currentAnswer = answers[question.id]?.selectedOptionId || "";

  const handleSelectOption = async (optionId: string) => {
    await submitAnswer(question.id, optionId);
  };

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 rounded-2xl border border-neutral-200/60 bg-white dark:border-neutral-800/60 dark:bg-neutral-900 shadow-sm">
      {/* Header Info */}
      <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-neutral-800">
        <span className="text-sm font-semibold uppercase tracking-wider text-primary bg-primary/5 px-3 py-1 rounded-full">
          Soal Pilihan Ganda
        </span>
        <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">
          Nomor {questionNumber} dari {useExamStore.getState().questions.length}
        </span>
      </div>

      {/* Question Stem */}
      <RichContent
        html={question.text}
        className="question-html text-lg font-medium text-neutral-900 dark:text-neutral-100 leading-relaxed"
      />

      {/* Options Panel */}
      <RadioGroup
        value={currentAnswer}
        onValueChange={handleSelectOption}
        className="flex flex-col gap-3 mt-2"
      >
        {question.options.map((option, index) => {
          const optionLetter = String.fromCharCode(65 + index);
          const isSelected = currentAnswer === option.id;

          return (
            <div
              key={option.id}
              onClick={() => handleSelectOption(option.id)}
              className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                isSelected
                  ? "bg-primary/5 border-primary shadow-sm"
                  : "bg-neutral-50/50 border-neutral-100 hover:bg-neutral-50 hover:border-neutral-200 dark:bg-neutral-800/40 dark:border-neutral-800 dark:hover:bg-neutral-800/80 dark:hover:border-neutral-700"
              }`}
            >
              <RadioGroupItem
                value={option.id}
                id={option.id}
                onClick={(e) => e.stopPropagation()}
              />
              <Label
                htmlFor={option.id}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 flex gap-3 text-base font-medium cursor-pointer leading-normal text-neutral-800 dark:text-neutral-200"
              >
                <span
                  className={`flex items-center justify-center w-7 h-7 rounded-lg text-sm font-bold border transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-white text-neutral-500 border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-400"
                  }`}
                >
                  {optionLetter}
                </span>
                <RichContent
                  html={option.text}
                  className="question-html flex-1 pt-0.5"
                />
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </div>
  );
};
