import { useExamStore } from "../../stores/exam";
import { useAuthStore } from "../../stores/auth";
import { Button } from "../ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../ui/card";
import { toast } from "sonner";
import { createLogger } from "../../lib/logger";

const log = createLogger("ResultPage");

interface ResultPageProps {
  /** Called after the session is cleaned up to navigate back to login. */
  onFinish: () => void;
}

/**
 * Post-exam summary screen. Renders the final score with a color band, a
 * correct/wrong/empty breakdown, and a "finish" action that resets the exam
 * state and logs the student out. Shows a fallback when no result is present.
 */
export const ResultPage = ({ onFinish }: ResultPageProps) => {
  const { examResult, resetExam, examTitle } = useExamStore();
  const { user, logout } = useAuthStore();

  const handleFinish = async () => {
    try {
      resetExam();
      await logout();
      toast.success("Sesi ujian berakhir dengan aman!");
      onFinish();
    } catch (error) {
      // Navigation must still proceed even if cleanup fails.
      log.error("Error ending session", error);
      onFinish();
    }
  };

  // If result is empty, show a fallback message
  if (!examResult) {
    return (
      <Card className="w-full max-w-lg mx-auto shadow-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <CardContent className="p-8 text-center space-y-4">
          <div className="text-destructive font-bold text-lg">Data hasil ujian tidak ditemukan.</div>
          <Button onClick={handleFinish} className="font-semibold px-6 py-2 rounded-xl">
            Kembali ke Login
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Determine score color badge
  const score = examResult.score;
  let scoreColor = "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50";
  if (score < 60) {
    scoreColor = "text-destructive bg-destructive/5 border-destructive/20";
  } else if (score < 85) {
    scoreColor = "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50";
  }

  return (
    <Card className="w-full max-w-xl mx-auto shadow-2xl border border-neutral-200/50 bg-white/90 backdrop-blur-md dark:bg-neutral-900/90 dark:border-neutral-800/50">
      <CardHeader className="text-center pb-4">
        <div className="flex justify-center mb-3">
          <div className="bg-primary/10 text-primary p-3.5 rounded-full">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-10 h-10 text-primary"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z"
              />
            </svg>
          </div>
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50">
          Hasil Ujian Selesai
        </CardTitle>
        <CardDescription className="text-neutral-500 dark:text-neutral-400">
          Ujian Anda telah berhasil diserahkan ke server utama.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Student metadata */}
        <div className="flex flex-col gap-1.5 p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/20 text-sm font-semibold text-neutral-600 dark:text-neutral-400">
          <div className="flex justify-between">
            <span>Nama Siswa:</span>
            <span className="text-neutral-900 dark:text-neutral-100">{user?.name}</span>
          </div>
          <div className="flex justify-between">
            <span>NIS Siswa:</span>
            <span className="text-neutral-900 dark:text-neutral-100">{user?.nis}</span>
          </div>
          <div className="flex justify-between">
            <span>Mata Ujian:</span>
            <span className="text-neutral-900 dark:text-neutral-100">{examTitle || "Ujian CBT Utama"}</span>
          </div>
        </div>

        {/* Score Ring Display */}
        <div className="flex flex-col items-center justify-center p-6 border rounded-2xl bg-white dark:bg-neutral-900 border-neutral-200/60 dark:border-neutral-800">
          <span className="text-sm font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2">
            Nilai Perolehan
          </span>
          <div
            className={`text-6xl font-extrabold px-8 py-5 rounded-3xl border-2 tracking-tighter ${scoreColor}`}
          >
            {score}
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 border border-neutral-100 rounded-xl bg-emerald-50/20 dark:border-neutral-800 dark:bg-emerald-950/5">
            <span className="block text-sm font-bold text-neutral-500 dark:text-neutral-400">
              Benar
            </span>
            <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {examResult.totalCorrect}
            </span>
          </div>
          <div className="p-3 border border-neutral-100 rounded-xl bg-destructive/5 dark:border-neutral-800 dark:bg-destructive/5">
            <span className="block text-sm font-bold text-neutral-500 dark:text-neutral-400">
              Salah
            </span>
            <span className="text-2xl font-extrabold text-destructive">
              {examResult.totalWrong}
            </span>
          </div>
          <div className="p-3 border border-neutral-100 rounded-xl bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800/30">
            <span className="block text-sm font-bold text-neutral-500 dark:text-neutral-400">
              Kosong
            </span>
            <span className="text-2xl font-extrabold text-neutral-600 dark:text-neutral-300">
              {examResult.totalEmpty}
            </span>
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <Button
          onClick={handleFinish}
          className="w-full bg-primary hover:bg-primary/95 text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/10 transition-all"
        >
          Selesai & Keluar Sesi
        </Button>
      </CardFooter>
    </Card>
  );
};
