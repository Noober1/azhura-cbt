import { TriangleAlert, FileText, Clock } from "lucide-react";
import type { AvailableExam } from "../../types";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../ui/alert-dialog";

interface StartExamDialogProps {
  /** The exam awaiting confirmation, or `null` when the dialog is closed. */
  exam: AvailableExam | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Invoked when the student confirms they want to begin the exam. */
  onConfirm: () => void;
  /** When `true`, disables actions and shows a loading label. */
  isStarting: boolean;
}

/**
 * Confirmation dialog shown before a student commits to an exam. Surfaces the
 * chosen subject and warns that, once started, the exam must be completed in
 * full before the student can leave it.
 */
export const StartExamDialog = ({
  exam,
  open,
  onOpenChange,
  onConfirm,
  isStarting,
}: StartExamDialogProps) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="default" className="p-6">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-bold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
            <TriangleAlert className="w-6 h-6 text-amber-500 shrink-0" />
            <span>Konfirmasi Pilihan Ujian</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
            Anda akan memulai ujian berikut. Pastikan pilihan Anda sudah benar
            sebelum melanjutkan.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Selected exam summary */}
        <div className="my-4 p-4 rounded-xl border border-neutral-100 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-800/20 space-y-2">
          <p className="font-bold text-base text-neutral-900 dark:text-neutral-50">
            {exam?.title ?? "-"}
          </p>
          <div className="flex items-center gap-4 text-xs font-semibold text-neutral-500">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              {exam?.totalQuestions ?? 0} Soal
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {exam?.durationMinutes ?? 0} Menit
            </span>
          </div>
        </div>

        {/* Mandatory-completion warning */}
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3.5 py-3 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-xs font-semibold leading-relaxed">
            Jika Anda memilih <strong>Lanjutkan</strong>, Anda{" "}
            <strong>WAJIB menyelesaikan ujian sampai tuntas</strong> pada mata
            pelajaran yang dipilih. Sesi ujian tidak dapat dibatalkan di tengah
            jalan.
          </p>
        </div>

        <AlertDialogFooter className="flex gap-2">
          <AlertDialogCancel
            disabled={isStarting}
            className="font-semibold rounded-xl"
          >
            Batal
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault(); // Confirm programmatically; keep dialog controlled.
              onConfirm();
            }}
            disabled={isStarting || !exam}
            className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
          >
            {isStarting ? "Mempersiapkan sesi..." : "Lanjutkan"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
