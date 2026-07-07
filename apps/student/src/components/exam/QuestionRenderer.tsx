import { Question } from "../../types";
import { useExamStore } from "../../stores/exam";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { RichContent } from "./RichContent";
import { resolveMediaUrl } from "../../lib/media";
import { FillInBlankQuestion } from "./FillInBlankQuestion";
import { MatchingQuestion } from "./MatchingQuestion";
import { SortingQuestion } from "./SortingQuestion";
import "../../styles/question-renderer.css";

interface QuestionRendererProps {
  question: Question;
  questionNumber: number;
}

/**
 * Dispatches to the appropriate question UI by `question.type`.
 * Defaults to multiple_choice for legacy questions without a type field.
 */
export const QuestionRenderer = ({ question, questionNumber }: QuestionRendererProps) => {
  const type = question.type ?? "multiple_choice";

  // key={question.id} forces a remount when navigating between two questions of
  // the same type. Without it React reuses the component instance and its local
  // useState (pairing / order / input value) initialized from the PREVIOUS
  // question bleeds into the next one — corrupting saved answers or crashing
  // when the item counts differ.
  if (type === "fill_in_blank") {
    return <FillInBlankQuestion key={question.id} question={question} questionNumber={questionNumber} />;
  }
  if (type === "matching") {
    return <MatchingQuestion key={question.id} question={question} questionNumber={questionNumber} />;
  }
  if (type === "sorting") {
    return <SortingQuestion key={question.id} question={question} questionNumber={questionNumber} />;
  }

  return <MultipleChoiceQuestion key={question.id} question={question} questionNumber={questionNumber} />;
};

function MultipleChoiceQuestion({ question, questionNumber }: QuestionRendererProps) {
  const { answers, submitAnswer } = useExamStore();
  const currentAnswer = answers[question.id]?.selectedOptionId || "";

  const handleSelectOption = async (optionId: string) => {
    await submitAnswer(question.id, optionId);
  };

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 rounded-2xl border-[2.5px] border-[var(--nb-ink)] bg-white shadow-[3px_3px_0_var(--nb-ink)]">
      <div className="flex items-center justify-between pb-4 border-b-2 border-soft">
        <span className="text-sm font-bold uppercase tracking-wider text-foreground border-2 border-[var(--nb-ink)] bg-secondary px-3 py-1 rounded-full">
          Soal Pilihan Ganda
        </span>
        <span className="tabular text-sm font-bold text-muted-foreground">
          Nomor {questionNumber} dari {useExamStore.getState().questions.length}
        </span>
      </div>

      <RichContent
        html={question.text}
        questionId={question.id}
        className="question-html text-lg font-medium text-foreground leading-relaxed"
      />

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
              className={`flex items-center gap-4 p-4 rounded-xl border-2 border-[var(--nb-ink)] cursor-pointer transition-all duration-150 ${
                isSelected
                  ? "bg-indigo/15 shadow-[3px_3px_0_var(--nb-ink)] -translate-x-px -translate-y-px"
                  : "bg-white hover:bg-muted/50"
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
                className="flex-1 flex gap-3 text-base font-medium cursor-pointer leading-normal text-foreground"
              >
                <span
                  className={`flex items-center justify-center w-7 h-7 rounded-lg text-sm font-bold border-2 border-[var(--nb-ink)] transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-white text-foreground"
                  }`}
                >
                  {optionLetter}
                </span>
                <div className="flex-1 flex flex-col gap-2 pt-0.5">
                  <RichContent html={option.text} questionId={question.id} className="question-html" />
                  {option.imageUrl && (
                    <img
                      src={resolveMediaUrl(option.imageUrl)}
                      alt={`Gambar opsi ${optionLetter}`}
                      loading="lazy"
                      className="max-h-48 max-w-full self-start rounded-lg border-2 border-[var(--nb-ink)] object-contain bg-white"
                    />
                  )}
                </div>
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </div>
  );
}
