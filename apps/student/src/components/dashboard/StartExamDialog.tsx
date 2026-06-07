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
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../ui/input-otp";
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";
import { Label } from "../ui/label";

/** Mirrors the server rule: 1–5 alphanumeric characters (see lib/exam-token.ts). */
const TOKEN_PATTERN = /^[A-Za-z0-9]{1,5}$/;

/**
 * Number of OTP boxes rendered. The client never learns a token's exact length
 * (the raw token never leaves the server — only the `requiresToken` flag does),
 * so we render the column maximum (5, per `exams.token varchar(5)`). A shorter
 * token of 1–4 chars is still accepted; the student just leaves trailing boxes
 * empty and presses Lanjutkan.
 */
const TOKEN_LENGTH = 5;

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
  /**
   * A monotonically increasing nonce the parent bumps whenever a start attempt
   * is rejected because the access token was wrong (#47). Each new value clears
   * the OTP boxes and refocuses them so the student can retype immediately.
   * Ignored at its initial `0`.
   */
  tokenRejectedNonce?: number;
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
  tokenRejectedNonce = 0,
}: StartExamDialogProps) => {
  const requiresToken = exam?.requiresToken ?? false;
  const [token, setToken] = useState("");
  // True after the server rejects the token; cleared as soon as the student
  // types again. Drives the red error styling and message.
  const [tokenRejected, setTokenRejected] = useState(false);

  // Reset the token field whenever the dialog targets a different exam (or
  // reopens) so a previous entry never carries over.
  useEffect(() => {
    setToken("");
    setTokenRejected(false);
  }, [exam?.id, open]);

  // On a wrong-token rejection (#47): clear the boxes and refocus so the student
  // can retype straight away. The input exposes id="exam-token" (input-otp
  // forwards it to the real <input>), so focus it once the cleared value paints.
  useEffect(() => {
    if (!tokenRejectedNonce) return; // ignore the initial 0
    setToken("");
    setTokenRejected(true);
    const raf = requestAnimationFrame(() => {
      document.getElementById("exam-token")?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [tokenRejectedNonce]);

  const tokenValid = !requiresToken || TOKEN_PATTERN.test(token);
  // Show an error hint for a bad format (once the student types) or a rejection.
  const showFormatError = requiresToken && token.length > 0 && !tokenValid;
  const showTokenError = showFormatError || tokenRejected;

  const handleConfirm = () => {
    if (!exam || isStarting) return;
    if (requiresToken && !tokenValid) return;
    onConfirm(requiresToken ? token : undefined);
  };

  // Typing a new character dismisses a prior rejection and normalizes to upper.
  const handleTokenChange = (value: string) => {
    setToken(value.toUpperCase());
    if (tokenRejected) setTokenRejected(false);
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
            <InputOTP
              id="exam-token"
              maxLength={TOKEN_LENGTH}
              // Alphanumeric only — mirrors the server token format so symbols
              // can't even be typed. Upper-case as the student types so the box
              // display matches the canonical (case-insensitive) stored token.
              pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
              value={token}
              onChange={handleTokenChange}
              // Enter confirms once a token of valid length has been entered.
              onComplete={handleConfirm}
              autoFocus
              disabled={isStarting}
              aria-invalid={showTokenError}
              containerClassName="justify-center"
            >
              <InputOTPGroup className="gap-2">
                {Array.from({ length: TOKEN_LENGTH }, (_, i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className={`h-11 w-11 rounded-md border-l font-mono text-lg font-bold ${
                      showTokenError ? "border-destructive text-destructive" : ""
                    }`}
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <p
              className={`text-xs font-medium ${
                showTokenError
                  ? "text-destructive"
                  : "text-neutral-500 dark:text-neutral-400"
              }`}
            >
              {tokenRejected
                ? "Token salah. Silakan masukkan ulang."
                : showFormatError
                  ? "Token hanya boleh huruf dan angka, maksimal 5 karakter."
                  : "Masukkan token dari pengawas. Huruf besar/kecil tidak dibedakan."}
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
