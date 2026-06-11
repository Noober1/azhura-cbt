import { useExamStore } from "../../stores/exam";

/**
 * Sidebar showing exam progress: answered/flagged counts, a numbered grid for
 * jumping between questions (color-coded by answered/flagged/current state),
 * and a status legend.
 */
export const ExamSidebar = () => {
  const {
    questions,
    currentQuestionIndex,
    setCurrentQuestionIndex,
    answers,
    flaggedQuestions,
  } = useExamStore();

  const handleSelectQuestion = (index: number) => {
    setCurrentQuestionIndex(index);
  };

  // Compute status counts
  let answeredCount = 0;
  let flaggedCount = 0;

  questions.forEach((q) => {
    const a = answers[q.id];
    if (a?.selectedOptionId || a?.answerValue) answeredCount++;
    if (flaggedQuestions[q.id]) flaggedCount++;
  });

  return (
    <aside className="w-full lg:w-80 flex flex-col gap-6 p-5 rounded-2xl border-[2.5px] border-[var(--nb-ink)] bg-white shadow-[3px_3px_0_var(--nb-ink)]">
      {/* Stats Header */}
      <div>
        <h3 className="font-bold text-lg text-foreground mb-3">
          Status Soal Ujian
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-muted-foreground">
          <div className="bg-muted/50 p-2.5 rounded-lg border-2 border-[var(--nb-ink)]">
            <span className="tabular block text-lg font-extrabold text-blue">
              {answeredCount}/{questions.length}
            </span>
            <span>Terjawab</span>
          </div>
          <div className="bg-amber/40 p-2.5 rounded-lg border-2 border-[var(--nb-ink)]">
            <span className="tabular block text-lg font-extrabold text-foreground">
              {flaggedCount}
            </span>
            <span>Ragu-Ragu</span>
          </div>
        </div>
      </div>

      {/* Grid of Question Numbers */}
      <div className="flex-1" data-tour="exam-nav-grid">
        <span className="block text-sm font-semibold text-muted-foreground mb-3">
          Navigasi Nomor Soal
        </span>
        <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-5 gap-2 max-h-88 overflow-y-auto p-1.5">
          {questions.map((q, index) => {
            const isSelected = index === currentQuestionIndex;
            const isAnswered = !!(answers[q.id]?.selectedOptionId || answers[q.id]?.answerValue);
            const isFlagged = !!flaggedQuestions[q.id];

            // Traffic-light fills, every cell black-bordered (neobrutalist):
            // grey = unanswered, blue = answered, amber (ink text) = flagged.
            let btnClass = "bg-muted text-foreground hover:bg-secondary";

            if (isFlagged) {
              btnClass = "bg-amber text-foreground hover:bg-amber";
            } else if (isAnswered) {
              btnClass = "bg-blue text-white hover:bg-blue";
            }

            return (
              <button
                key={q.id}
                onClick={() => handleSelectQuestion(index)}
                className={`flex items-center justify-center aspect-square text-base font-bold rounded-xl border-2 border-[var(--nb-ink)] transition-all duration-150 ${btnClass} ${
                  isSelected
                    ? "scale-[1.06] shadow-[2px_2px_0_var(--nb-ink)]"
                    : ""
                }`}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend Block */}
      <div className="pt-4 border-t border-soft text-xs font-semibold text-muted-foreground space-y-2.5">
        <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
          Keterangan Status
        </span>
        <div className="flex items-center gap-2.5">
          <span className="w-4 h-4 rounded border-2 border-[var(--nb-ink)] bg-muted" />
          <span>Belum Dijawab</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-4 h-4 rounded border-2 border-[var(--nb-ink)] bg-blue" />
          <span>Sudah Dijawab</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-4 h-4 rounded border-2 border-[var(--nb-ink)] bg-amber" />
          <span>Ragu - Ragu</span>
        </div>
      </div>
    </aside>
  );
};
