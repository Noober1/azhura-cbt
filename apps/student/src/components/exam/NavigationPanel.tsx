import { useExamStore } from "../../stores/exam";
import { Button } from "../ui/button";

interface NavigationPanelProps {
  /** Invoked when the student presses "Kumpulkan Ujian" on the last question. */
  onSubmitClick: () => void;
}

/**
 * Bottom control bar for the active question: previous/next navigation, a
 * "ragu-ragu" (flag) toggle, and — on the last question — the submit button.
 */
export const NavigationPanel = ({ onSubmitClick }: NavigationPanelProps) => {
  const {
    questions,
    currentQuestionIndex,
    setCurrentQuestionIndex,
    flaggedQuestions,
    toggleFlagQuestion,
  } = useExamStore();

  const isFirst = currentQuestionIndex === 0;
  const isLast = currentQuestionIndex === questions.length - 1;
  const currentQuestionId = questions[currentQuestionIndex]?.id;
  const isCurrentlyFlagged = !!flaggedQuestions[currentQuestionId];

  const handlePrev = () => {
    if (!isFirst) setCurrentQuestionIndex(currentQuestionIndex - 1);
  };

  const handleNext = () => {
    if (!isLast) setCurrentQuestionIndex(currentQuestionIndex + 1);
  };

  const handleFlag = async () => {
    if (currentQuestionId) {
      await toggleFlagQuestion(currentQuestionId);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl border-[2.5px] border-[var(--nb-ink)] bg-white shadow-[3px_3px_0_var(--nb-ink)]">
      {/* Back/Prev Button */}
      <Button
        variant="outline"
        onClick={handlePrev}
        disabled={isFirst}
        className="flex items-center gap-2 font-semibold px-5 py-2.5 rounded-xl transition-all"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
          stroke="currentColor"
          className="w-4 h-4"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        <span>Sebelumnya</span>
      </Button>

      {/* Flag / Ragu-ragu Toggle Button */}
      {/* Black-bordered flag toggle — solid amber fill (ink text) when active. */}
      <Button
        variant="outline"
        onClick={handleFlag}
        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl ${
          isCurrentlyFlagged ? "bg-amber text-foreground hover:bg-amber" : "hover:bg-amber/20"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill={isCurrentlyFlagged ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={2}
          className="w-5 h-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-6.005-1.248 48.535 48.535 0 0 1-6.208-.682L3 15m0 0V9m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.52 48.52 0 0 1-6.005-1.248 48.535 48.535 0 0 1-6.208-.682L3 9"
          />
        </svg>
        <span>Ragu - Ragu</span>
      </Button>

      {/* Next/Finish Button */}
      {isLast ? (
        <Button
          variant="emerald"
          onClick={onSubmitClick}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl"
        >
          <span>Kumpulkan Ujian</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </Button>
      ) : (
        <Button
          onClick={handleNext}
          className="flex items-center gap-2 font-semibold px-5 py-2.5 rounded-xl transition-all"
        >
          <span>Berikutnya</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </Button>
      )}
    </div>
  );
};
