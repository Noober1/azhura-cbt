import { ListChecks, Clock, FileText, PlayCircle, Inbox } from "lucide-react";
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
  return (
    <Card className="shadow-sm border border-neutral-200/60 bg-white/90 backdrop-blur-sm dark:bg-neutral-900/90 dark:border-neutral-800/60">
      <CardHeader className="border-b pb-4">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 p-2 rounded-lg">
            <ListChecks className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base text-neutral-950 dark:text-neutral-50">
              Daftar Ujian Tersedia
            </h2>
            <p className="text-xs font-medium text-neutral-500">
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
                <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-200/70 dark:border-neutral-800">
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
                {exams.map((exam) => (
                  <tr
                    key={exam.id}
                    className="border-b border-neutral-100 last:border-0 transition-colors hover:bg-neutral-50/80 dark:border-neutral-800/60 dark:hover:bg-neutral-800/30"
                  >
                    <td className="px-4 py-3.5 font-semibold text-neutral-900 dark:text-neutral-100">
                      {exam.title}
                    </td>
                    <td className="px-3 py-3.5 text-center whitespace-nowrap text-neutral-600 dark:text-neutral-300">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <FileText className="w-3.5 h-3.5 text-neutral-400" />
                        {exam.totalQuestions}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-center whitespace-nowrap text-neutral-600 dark:text-neutral-300">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <Clock className="w-3.5 h-3.5 text-neutral-400" />
                        {exam.durationMinutes} mnt
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Button
                        size="sm"
                        onClick={() => onStart(exam)}
                        disabled={startingExamId !== null}
                        className="font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm shadow-emerald-600/10"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        {startingExamId === exam.id ? "Memuat..." : "Mulai Ujian"}
                      </Button>
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
        className="h-12 rounded-lg bg-neutral-100/80 dark:bg-neutral-800/40 animate-pulse"
      />
    ))}
  </div>
);

/** Shown when the server returns no exams for this student. */
const EmptyState = () => (
  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-neutral-400">
    <Inbox className="w-10 h-10" />
    <p className="text-sm font-semibold">Belum ada ujian yang tersedia.</p>
    <p className="text-xs">Silakan hubungi pengawas atau coba muat ulang nanti.</p>
  </div>
);
