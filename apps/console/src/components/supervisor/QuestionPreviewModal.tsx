import { useState } from "react";
import { Modal } from "../ui/Modal";
import { QuestionContentRenderer } from "./QuestionContentRenderer";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

interface QuestionPreviewModalProps {
  open: boolean;
  onClose: () => void;
  questionText: string;
  options: string[];
  correctIndex: number;
}

export function QuestionPreviewModal({
  open,
  onClose,
  questionText,
  options,
  correctIndex,
}: QuestionPreviewModalProps) {
  const [showAnswer, setShowAnswer] = useState(true);

  return (
    <Modal
      open={open}
      title="Preview Soal"
      description="Tampilan soal sebagaimana dilihat oleh student."
      onClose={onClose}
      size="lg"
      footer={
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft select-none">
          <input
            type="checkbox"
            checked={showAnswer}
            onChange={(e) => setShowAnswer(e.target.checked)}
            className="accent-accent size-3.5"
          />
          Tampilkan jawaban benar
        </label>
      }
    >
      <div className="space-y-5">
        {/* Question stem */}
        <QuestionContentRenderer html={questionText} className="text-base text-ink" />

        {/* Options */}
        <div className="space-y-2">
          {options.map((optHtml, idx) => {
            const isCorrect = idx === correctIndex;
            const highlight = showAnswer && isCorrect;
            return (
              <div
                key={idx}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                  highlight
                    ? "border-positive/30 bg-success/10"
                    : "border-line bg-canvas"
                }`}
              >
                <span
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                    highlight
                      ? "bg-positive text-white"
                      : "bg-surface text-faint border border-line"
                  }`}
                >
                  {OPTION_LABELS[idx]}
                </span>
                <QuestionContentRenderer
                  html={optHtml}
                  className={`flex-1 text-sm ${highlight ? "text-positive font-medium" : "text-ink"}`}
                />
                {highlight && (
                  <svg
                    className="mt-0.5 size-4 shrink-0 text-positive"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-label="Jawaban benar"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
