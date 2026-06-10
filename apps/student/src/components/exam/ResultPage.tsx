import { useExamStore } from "../../stores/exam";
import { useAuthStore } from "../../stores/auth";
import { Button } from "../ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../ui/card";
import { toast } from "sonner";

interface ResultPageProps {
  /** Called to navigate back to the dashboard after viewing the result. */
  onFinish: () => void;
}

/**
 * Post-exam summary screen. Renders the final score with a color band, a
 * correct/wrong/empty breakdown, and a "finish" action that resets the exam
 * state and returns to the dashboard. The student stays logged in — finishing an
 * exam does not end their session. Shows a fallback when no result is present.
 */
export const ResultPage = ({ onFinish }: ResultPageProps) => {
  const { examResult, resetExam, examTitle } = useExamStore();
  const { user } = useAuthStore();

  const handleFinish = () => {
    // Clear the finished exam from state and go back to the dashboard. The
    // student's auth session is intentionally left intact.
    resetExam();
    toast.success("Ujian selesai. Kembali ke dashboard.");
    onFinish();
  };

  // If result is empty, show a fallback message
  if (!examResult) {
    return (
      <Card className="w-full max-w-lg mx-auto shadow-[8px_8px_0_var(--nb-ink)]">
        <CardContent className="p-8 text-center space-y-4">
          <div className="text-destructive font-bold text-lg">Data hasil ujian tidak ditemukan.</div>
          <Button onClick={handleFinish} className="font-semibold px-6 py-2 rounded-xl">
            Kembali ke Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  const score = examResult.score;
  const { passingGrade } = examResult;

  const passed = passingGrade > 0 && score >= passingGrade;
  const failed = passingGrade > 0 && score < passingGrade;

  // Color: passing-grade-aware when set, otherwise legacy heuristic.
  let scoreColor: string;
  if (failed) {
    scoreColor = "bg-destructive text-white";
  } else if (passed) {
    scoreColor = "bg-emerald text-white";
  } else if (score < 60) {
    scoreColor = "bg-destructive text-white";
  } else if (score < 85) {
    scoreColor = "bg-blue text-white";
  } else {
    scoreColor = "bg-emerald text-white";
  }

  return (
    <Card className="w-full max-w-xl mx-auto shadow-[8px_8px_0_var(--nb-ink)]">
      <CardHeader className="text-center pb-4">
        <div className="flex justify-center mb-3">
          <div className="bg-emerald text-white p-3.5 rounded-full border-[2.5px] border-[var(--nb-ink)] shadow-[3px_3px_0_var(--nb-ink)]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-10 h-10 text-white"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z"
              />
            </svg>
          </div>
        </div>
        <CardTitle className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
          Hasil Ujian Selesai
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Ujian Anda telah berhasil diserahkan ke server utama.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Student metadata */}
        <div className="flex flex-col gap-1.5 p-4 rounded-xl border-2 border-[var(--nb-ink)] bg-muted/50 text-sm font-semibold text-muted-foreground">
          <div className="flex justify-between">
            <span>Nama Siswa:</span>
            <span className="text-foreground">{user?.name}</span>
          </div>
          <div className="flex justify-between">
            <span>NIS Siswa:</span>
            <span className="text-foreground">{user?.nis}</span>
          </div>
          <div className="flex justify-between">
            <span>Mata Ujian:</span>
            <span className="text-foreground">{examTitle || "Ujian CBT Utama"}</span>
          </div>
        </div>

        {/* Score Ring Display */}
        <div className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-[var(--nb-ink)] bg-white">
          <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Nilai Perolehan
          </span>
          <div
            className={`tabular text-6xl font-black px-8 py-5 rounded-2xl border-[3px] border-[var(--nb-ink)] tracking-tighter shadow-[5px_5px_0_var(--nb-ink)] ${scoreColor}`}
          >
            {score}
          </div>
          {passingGrade > 0 && (
            <span
              className={`mt-3 text-sm font-semibold ${
                passed ? "text-emerald" : "text-destructive"
              }`}
            >
              {passed ? "Lulus" : "Tidak Lulus"}
              <span className="ml-1 font-normal text-muted-foreground">
                (KKM {passingGrade})
              </span>
            </span>
          )}
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-xl border-2 border-[var(--nb-ink)] bg-emerald/15">
            <span className="block text-sm font-bold text-muted-foreground">
              Benar
            </span>
            <span className="tabular text-2xl font-extrabold text-emerald">
              {examResult.totalCorrect}
            </span>
          </div>
          <div className="p-3 rounded-xl border-2 border-[var(--nb-ink)] bg-destructive/10">
            <span className="block text-sm font-bold text-muted-foreground">
              Salah
            </span>
            <span className="tabular text-2xl font-extrabold text-destructive">
              {examResult.totalWrong}
            </span>
          </div>
          <div className="p-3 rounded-xl border-2 border-[var(--nb-ink)] bg-muted/50">
            <span className="block text-sm font-bold text-muted-foreground">
              Kosong
            </span>
            <span className="tabular text-2xl font-extrabold text-muted-foreground">
              {examResult.totalEmpty}
            </span>
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <Button
          onClick={handleFinish}
          className="w-full py-3 rounded-xl"
        >
          Kembali ke Dashboard
        </Button>
      </CardFooter>
    </Card>
  );
};
