import { ListChecks, Clock, FileText, PlayCircle, Inbox, CheckCircle2, Lock } from "lucide-react";
import type { AvailableExam } from "../../types";
import { Card, CardHeader, CardContent } from "../ui/card";
import { Button } from "../ui/button";

interface ExamListTableProps {
  exams: AvailableExam[];
  isLoading: boolean;
  /** id of the exam currently being started (disables its row button). */
  startingExamId: string | null;
  onStart: (exam: AvailableExam) => void;
}

/**
 * Right-column panel listing every exam the student may take, rendered as a
 * table with columns: subject, question count, duration, and a start action.
 */
export const ExamListTable = ({
  exams,
  isLoading,
  startingExamId,
  onStart,
}: ExamListTableProps) => {
  // Indices used to anchor the product tour (#145) to a single representative
  // row: the first startable exam, and the first token-gated startable exam.
  const firstStartableIndex = exams.findIndex((e) => !e.completed);
  const firstTokenIndex = exams.findIndex((e) => e.requiresToken && !e.completed);

  return (
    <Card data-tour="exam-list">
      <CardHeader className="border-b pb-4">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo/10 text-indigo p-2 rounded-lg">
            <ListChecks className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base text-foreground">
              Daftar Ujian Tersedia
            </h2>
            <p className="text-xs font-medium text-muted-foreground">
              Pilih salah satu mata ujian di bawah ini untuk memulai.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-0">
        {isLoading ? (
          <TableSkeleton />
        ) : exams.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs font-extrabold uppercase tracking-wider text-foreground bg-amber border-b-2 border-[var(--nb-ink)]">
                  <th className="px-4 py-2.5 font-semibold">Mata Ujian</th>
                  <th className="px-3 py-2.5 font-semibold text-center whitespace-nowrap">
                    Jumlah Soal
                  </th>
                  <th className="px-3 py-2.5 font-semibold text-center whitespace-nowrap">
                    Durasi
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((exam, index) => (
                  <tr
                    key={exam.id}
                    className="border-b border-soft last:border-0 transition-colors hover:bg-muted/50 dark:border-soft"
                  >
                    <td className="px-4 py-3.5 font-semibold text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {exam.title}
                        {exam.requiresToken && !exam.completed && (
                          <span
                            // Tour anchor (#145) on the first token-gated row only.
                            data-tour={index === firstTokenIndex ? "exam-token" : undefined}
                            title="Ujian ini memerlukan token akses"
                            className="inline-flex items-center gap-1 rounded-md bg-indigo/10 px-1.5 py-0.5 text-[11px] font-semibold text-indigo"
                          >
                            <Lock className="w-3 h-3" />
                            Token
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-center whitespace-nowrap text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        {exam.totalQuestions}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-center whitespace-nowrap text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        {exam.durationMinutes} mnt
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {exam.completed ? (
                        // A submitted exam cannot be retaken — surface a clear
                        // "done" state instead of the start action (#retake-guard).
                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald text-sm">
                          <CheckCircle2 className="w-4 h-4" />
                          Sudah Dikerjakan
                        </span>
                      ) : (
                        <Button
                          // Tour anchor (#145) on the first startable row only.
                          data-tour={index === firstStartableIndex ? "exam-start" : undefined}
                          size="sm"
                          onClick={() => onStart(exam)}
                          disabled={startingExamId !== null}
                          className="bg-emerald hover:brightness-95 text-white rounded-lg"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          {startingExamId === exam.id ? "Memuat..." : "Mulai Ujian"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/** Placeholder rows shown while the exam list is loading. */
const TableSkeleton = () => (
  <div className="px-4 py-2 space-y-2">
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        className="h-12 rounded-lg bg-muted/50 animate-pulse"
      />
    ))}
  </div>
);

/** Shown when the server returns no exams for this student. */
const EmptyState = () => (
  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
    <Inbox className="w-10 h-10" />
    <p className="text-sm font-semibold">Belum ada ujian yang tersedia.</p>
    <p className="text-xs">Silakan hubungi pengawas atau coba muat ulang nanti.</p>
  </div>
);
