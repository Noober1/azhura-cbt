import { useEffect, useState } from "react";
import { TriangleAlert, FileText, Clock, KeyRound } from "lucide-react";
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
import { Input } from "../ui/input";
import { Label } from "../ui/label";

/** Mirrors the server rule: 1–5 alphanumeric characters (see lib/exam-token.ts). */
const TOKEN_PATTERN = /^[A-Za-z0-9]{1,5}$/;

interface StartExamDialogProps {
  /** The exam awaiting confirmation, or `null` when the dialog is closed. */
  exam: AvailableExam | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Invoked when the student confirms they want to begin the exam. Carries the
   * entered access token when the exam is token-gated (`undefined` otherwise).
   */
  onConfirm: (token?: string) => void;
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
  const requiresToken = exam?.requiresToken ?? false;
  const [token, setToken] = useState("");

  // Reset the token field whenever the dialog targets a different exam (or
  // reopens) so a previous entry never carries over.
  useEffect(() => {
    setToken("");
  }, [exam?.id, open]);

  const tokenValid = !requiresToken || TOKEN_PATTERN.test(token);
  // Show the inline format hint only once the student has typed something.
  const showFormatError = requiresToken && token.length > 0 && !tokenValid;

  const handleConfirm = () => {
    if (!exam || isStarting) return;
    if (requiresToken && !tokenValid) return;
    onConfirm(requiresToken ? token : undefined);
  };

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

        {/* Access token gate (#1): only for token-protected exams. */}
        {requiresToken && (
          <div className="mt-4 space-y-1.5">
            <Label
              htmlFor="exam-token"
              className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700 dark:text-neutral-300"
            >
              <KeyRound className="w-4 h-4 text-indigo-500" />
              Token Akses Ujian
            </Label>
            <Input
              id="exam-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirm();
              }}
              maxLength={5}
              autoFocus
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={isStarting}
              placeholder="Masukkan token dari pengawas"
              aria-invalid={showFormatError}
              className="font-mono tracking-widest"
            />
            <p
              className={`text-xs font-medium ${
                showFormatError
                  ? "text-destructive"
                  : "text-neutral-500 dark:text-neutral-400"
              }`}
            >
              {showFormatError
                ? "Token hanya boleh huruf dan angka, maksimal 5 karakter."
                : "Token bersifat case-sensitive (huruf besar/kecil dibedakan)."}
            </p>
          </div>
        )}

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
              handleConfirm();
            }}
            disabled={isStarting || !exam || (requiresToken && !tokenValid)}
            className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
          >
            {isStarting ? "Mempersiapkan sesi..." : "Lanjutkan"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
