import { useExamStore } from "../../stores/exam";
import { useConnectivityStore } from "../../stores/connectivity";

/**
 * Full-screen blocking overlay shown while the exam is being finalized (#8).
 *
 * When time runs out, the student presses "Selesai", or a supervisor force-finishes
 * the exam, {@link useExamStore.finalizeExam} retries the submit until the server
 * accepts it. This overlay covers the whole screen for the duration so the UI is
 * locked (no further answering/navigation) and the student understands the app is
 * working — not frozen — even while offline and waiting to reconnect.
 *
 * It renders only while `finalizing` is true and no result has landed yet; once
 * the result is set, ExamLayout routes to the result page and the overlay unmounts.
 */
export const ProcessingOverlay = () => {
  const finalizing = useExamStore((s) => s.finalizing);
  const examResult = useExamStore((s) => s.examResult);
  const isOnline = useConnectivityStore((s) => s.isOnline);

  if (!finalizing || examResult) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-[rgba(21,19,15,0.75)] p-6 text-center"
      role="alertdialog"
      aria-modal="true"
      aria-label="Mengumpulkan ujian"
    >
      <svg
        className="animate-spin h-12 w-12 text-white"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>

      <div className="max-w-md space-y-2">
        <h2 className="text-lg font-bold text-white">Mengumpulkan jawaban Anda…</h2>
        <p className="text-sm font-medium text-neutral-200">
          {isOnline
            ? "Mohon tunggu, jawaban Anda sedang dikirim ke server. Jangan tutup aplikasi."
            : "Menunggu koneksi kembali. Jawaban Anda aman tersimpan dan akan dikirim otomatis begitu tersambung — jangan tutup aplikasi."}
        </p>
      </div>

      <div
        className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${
          isOnline
            ? "border-2 border-white/40 bg-emerald text-white"
            : "border-2 border-white/40 bg-amber text-foreground"
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald animate-pulse" : "bg-amber"}`} />
        {isOnline ? "Mengirim…" : "Menunggu koneksi"}
      </div>
    </div>
  );
};
