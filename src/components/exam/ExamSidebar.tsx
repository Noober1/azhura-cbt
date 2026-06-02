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
    if (answers[q.id]?.selectedOptionId) answeredCount++;
    if (flaggedQuestions[q.id]) flaggedCount++;
  });

  return (
    <aside className="w-full lg:w-80 flex flex-col gap-6 p-5 rounded-2xl border border-neutral-200/60 bg-white dark:border-neutral-800/60 dark:bg-neutral-900 shadow-sm">
      {/* Stats Header */}
      <div>
        <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-50 mb-3">
          Status Soal Ujian
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-neutral-600 dark:text-neutral-400">
          <div className="bg-neutral-50 dark:bg-neutral-800/40 p-2.5 rounded-lg border border-neutral-100 dark:border-neutral-800">
            <span className="block text-lg font-extrabold text-blue-600 dark:text-blue-400">
              {answeredCount}/{questions.length}
            </span>
            <span>Terjawab</span>
          </div>
          <div className="bg-neutral-50 dark:bg-neutral-800/40 p-2.5 rounded-lg border border-neutral-100 dark:border-neutral-800">
            <span className="block text-lg font-extrabold text-amber-500">
              {flaggedCount}
            </span>
            <span>Ragu-Ragu</span>
          </div>
        </div>
      </div>

      {/* Grid of Question Numbers */}
      <div className="flex-1">
        <span className="block text-sm font-semibold text-neutral-500 dark:text-neutral-400 mb-3">
          Navigasi Nomor Soal
        </span>
        <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-5 gap-2 max-h-88 overflow-y-auto pr-1">
          {questions.map((q, index) => {
            const isSelected = index === currentQuestionIndex;
            const isAnswered = !!answers[q.id]?.selectedOptionId;
            const isFlagged = !!flaggedQuestions[q.id];

            // Determine background & borders based on status
            let btnClass = "bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100 dark:bg-neutral-800/50 dark:text-neutral-300 dark:border-neutral-800 dark:hover:bg-neutral-800";
            
            if (isFlagged) {
              btnClass = "bg-amber-500 text-white border-amber-500 hover:bg-amber-600";
            } else if (isAnswered) {
              btnClass = "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700";
            }

            return (
              <button
                key={q.id}
                onClick={() => handleSelectQuestion(index)}
                className={`flex items-center justify-center aspect-square text-base font-bold rounded-xl border-2 transition-all duration-150 ${btnClass} ${
                  isSelected
                    ? "ring-4 ring-primary/20 scale-105 border-neutral-900 dark:border-neutral-50"
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
      <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 text-xs font-semibold text-neutral-500 dark:text-neutral-400 space-y-2.5">
        <span className="block text-[11px] uppercase tracking-wider text-neutral-400 font-bold mb-1">
          Keterangan Status
        </span>
        <div className="flex items-center gap-2.5">
          <span className="w-4 h-4 rounded bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700" />
          <span>Belum Dijawab</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-4 h-4 rounded bg-blue-600" />
          <span>Sudah Dijawab</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-4 h-4 rounded bg-amber-500" />
          <span>Ragu - Ragu</span>
        </div>
      </div>
    </aside>
  );
};
