import { useExamStore } from "../../stores/exam";
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

interface SubmitConfirmationProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Open-state change handler (e.g. on cancel/overlay click). */
  onOpenChange: (open: boolean) => void;
  /** Invoked when the student confirms final submission. */
  onConfirm: () => void;
  /** When `true`, disables actions and shows a "submitting" label. */
  isSubmitting: boolean;
}

/**
 * Confirmation dialog shown before final submission. Summarizes total,
 * answered, flagged, and unanswered question counts so the student can review
 * before locking in their answers.
 */
export const SubmitConfirmation = ({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
}: SubmitConfirmationProps) => {
  const { questions, answers, flaggedQuestions } = useExamStore();

  // Compute status details
  let answeredCount = 0;
  let flaggedCount = 0;

  questions.forEach((q) => {
    const a = answers[q.id];
    if (a?.selectedOptionId || a?.answerValue) answeredCount++;
    if (flaggedQuestions[q.id]) flaggedCount++;
  });

  const unansweredCount = questions.length - answeredCount;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="default" className="p-6">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-6 h-6 text-amber"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            <span>Kumpulkan Ujian Sekarang?</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground mt-2">
            Harap tinjau ringkasan pekerjaan Anda di bawah ini sebelum menyelesaikan sesi ujian. Tindakan ini **tidak dapat dibatalkan** dan jawaban Anda akan dikunci secara permanen.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Summary Stats Card */}
        <div className="my-4 p-4 rounded-xl border border-soft bg-muted/50 dark:border-soft space-y-2 text-sm font-semibold">
          <div className="flex justify-between items-center text-muted-foreground">
            <span>Total Soal:</span>
            <span className="font-extrabold text-foreground">{questions.length}</span>
          </div>
          <div className="flex justify-between items-center text-blue">
            <span>Sudah Dijawab:</span>
            <span>{answeredCount} Soal</span>
          </div>
          <div className="flex justify-between items-center text-amber">
            <span>Masih Ragu-Ragu:</span>
            <span>{flaggedCount} Soal</span>
          </div>
          {unansweredCount > 0 && (
            <div className="flex justify-between items-center text-destructive">
              <span>Belum Dijawab:</span>
              <span className="font-bold">{unansweredCount} Soal</span>
            </div>
          )}
        </div>

        <AlertDialogFooter className="flex gap-2">
          <AlertDialogCancel disabled={isSubmitting} className="font-semibold rounded-xl">
            Batal
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault(); // Control trigger programmatically
              onConfirm();
            }}
            disabled={isSubmitting}
            className="font-bold bg-emerald hover:brightness-95 text-white rounded-xl"
          >
            {isSubmitting ? "Mengumpulkan..." : "Ya, Kumpulkan"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
