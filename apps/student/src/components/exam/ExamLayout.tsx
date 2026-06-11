import { useEffect, useState } from "react";
import { useExamStore } from "../../stores/exam";
import { useAuthStore } from "../../stores/auth";
import { useSocketStore } from "../../stores/socket";
import { useConnectivityStore } from "../../stores/connectivity";
import { useConfigStore } from "../../stores/config";
import {
  startExamMonitoring,
  enterFullscreen,
  detectMultiMonitor,
} from "../../lib/anti-cheat-config";
import { isEnforcementActive, runExamTourIfSafe } from "../../lib/tour";
import { Button } from "../ui/button";
import { HelpCircle } from "lucide-react";
import { QuestionRenderer } from "./QuestionRenderer";
import { ExamSidebar } from "./ExamSidebar";
import { NavigationPanel } from "./NavigationPanel";
import { TimerDisplay } from "./TimerDisplay";
import { SubmitConfirmation } from "./SubmitConfirmation";
import { ProcessingOverlay } from "./ProcessingOverlay";
import { toast } from "sonner";
import api from "../../lib/api";
import { createLogger } from "../../lib/logger";
import { getErrorMessage, toErrorContext } from "../../lib/errors";

const log = createLogger("ExamLayout");

interface ExamLayoutProps {
  /** Called after a successful manual submission to navigate to the result page. */
  onExamSubmitted: () => void;
}

/**
 * The main exam screen. On mount it restores any persisted session, connects
 * the proctoring socket, initializes anti-cheat, and fetches the question list.
 * It composes the header (status widgets + timer), the question navigation
 * sidebar, the active question, the prev/next controls, and the submit dialog.
 */
export const ExamLayout = ({ onExamSubmitted }: ExamLayoutProps) => {
  const {
    examTitle,
    questions,
    currentQuestionIndex,
    setQuestions,
    finalizeExam,
    isSubmitting,
    finalizing,
    examResult,
  } = useExamStore();

  const { user, token } = useAuthStore();
  const { isOnline } = useConnectivityStore();
  const { isConnected } = useSocketStore();
  const config = useConfigStore((s) => s.antiCheat);
  // When lockdown enforcement is active, the in-exam help button is hidden so a
  // tour overlay can never appear over a fullscreen/focus-monitored exam (#145).
  const enforcementActive = isEnforcementActive(config);

  const [isLoading, setIsLoading] = useState(true);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // 1. Initial configuration, data fetching and socket mapping
  useEffect(() => {
    // 1. Dynamically restore session on mount (prevents WebView initialization race condition)
    useExamStore.getState().restoreSession();

    // 2. Connect websocket
    if (token) {
      useSocketStore.getState().connect(token);
    }

    // 3. Fetch Questions
    const fetchQuestions = async () => {
      setIsLoading(true);
      try {
        const activeExamId = useExamStore.getState().examId;
        if (!activeExamId) throw new Error("Exam ID tidak ditemukan.");
        const response = await api.get(`/exams/${activeExamId}/questions`);
        setQuestions(response.data);
      } catch (error) {
        log.error("Failed to load exam questions", error, toErrorContext(error));
        toast.error(getErrorMessage(error, "Gagal memuat soal ujian dari server."));
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuestions();

    return () => {
      // Disconnect socket upon leaving exam
      useSocketStore.getState().disconnect();
    };
  }, [token, setQuestions]);

  // 2. Anti-Cheat L1 (web/DOM) monitoring, scoped to the exam screen to avoid
  //    false positives at login/dashboard. The L2 Tauri kiosk window and the
  //    L3 OS keyboard hook are managed app-wide (see App.tsx) so the lockdown
  //    holds from launch until app exit, not just during the exam.
  useEffect(() => {
    // Exam-scoped detection (focus loss + fullscreen). Input prevention
    // (right-click/shortcuts/clipboard) is app-wide in App.tsx.
    const cleanMonitoring = startExamMonitoring();

    if (config.enabled) {
      if (config.fullscreen) enterFullscreen();
      void detectMultiMonitor();
    }

    return () => cleanMonitoring();
  }, [config.enabled, config.fullscreen, config.detectMultiMonitor]);

  // 3. Confirm Final Submit — hand off to finalizeExam, which shows the blocking
  // Processing overlay and retries until the server accepts (idempotent). The
  // modal closes immediately; navigation happens via the examResult effect below.
  const handleConfirmSubmit = () => {
    setShowSubmitModal(false);
    void finalizeExam();
  };

  // Route to the result page once a score lands — whether it came from a manual
  // submit, the timer expiring, or a supervisor force-finish (all funnel through
  // finalizeExam). Centralizing navigation here avoids racing the retry loop.
  useEffect(() => {
    if (examResult) {
      toast.success("Ujian Anda telah berhasil dikumpulkan!");
      onExamSubmitted();
    }
  }, [examResult, onExamSubmitted]);

  if (isLoading) {
    return (
      <div className="shell min-h-screen flex flex-col items-center justify-center p-6">
        <svg
          className="animate-spin h-10 w-10 text-primary mb-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <span className="text-sm font-semibold text-muted-foreground">Mempersiapkan lembar ujian...</span>
      </div>
    );
  }

  const activeQuestion = questions[currentQuestionIndex];

  return (
    <div className="shell min-h-screen flex flex-col">
      {/* Top Header bar */}
      <header className="sticky top-0 z-40 w-full border-b-[3px] border-[var(--nb-ink)] bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          
          {/* Exam Title & Meta */}
          <div className="flex flex-col">
            <h1 className="font-bold text-base text-foreground truncate max-w-48 sm:max-w-xs md:max-w-md">
              {examTitle || "Ujian CBT Utama"}
            </h1>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span>Siswa: {user?.name}</span>
              <span>&bull;</span>
              <span>NIS: {user?.nis}</span>
            </div>
          </div>

          {/* Right Status Widgets */}
          <div className="flex items-center gap-3">
            {/* Exam-session help (#145) — SAFE-CONTEXT ONLY. Hidden whenever
                anti-cheat enforcement is active (fullscreen / focus-loss /
                OS keyboard lock), so a tour overlay never appears during a
                locked-down exam. When shown, the driver.js overlay stays inside
                the window and never moves focus out. The full panduan is also
                available before the exam from the start-exam dialog. */}
            {!enforcementActive && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => runExamTourIfSafe(config)}
                aria-label="Lihat panduan cara mengerjakan ujian"
                className="font-semibold rounded-lg"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Lihat panduan</span>
              </Button>
            )}

            {/* Connection Indicator */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                isOnline
                  ? "bg-emerald-50 text-emerald border-emerald-200"
                  : "bg-destructive/5 text-destructive border-destructive/20"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald animate-pulse" : "bg-destructive"}`} />
              <span className="hidden md:inline">{isOnline ? "Online" : "Offline Mode"}</span>
            </div>

            {/* Socket Status Indicator */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                isConnected
                  ? "bg-blue/15 text-blue"
                  : "bg-amber/25 text-foreground"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-blue" : "bg-amber"}`} />
              <span className="hidden md:inline">{isConnected ? "Server Realtime" : "Koneksi Bermasalah"}</span>
            </div>

            {/* Timer Countdown widget */}
            <div data-tour="exam-timer">
              <TimerDisplay />
            </div>
          </div>

        </div>
      </header>

      {/* Main Core Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col lg:flex-row gap-6">
        
        {/* Left Side: Question navigation Grid */}
        <ExamSidebar />

        {/* Right Side: Primary Active Question Panel */}
        <div className="flex-1 flex flex-col gap-6">
          {activeQuestion ? (
            <div data-tour="exam-question">
              <QuestionRenderer
                question={activeQuestion}
                questionNumber={currentQuestionIndex + 1}
              />
            </div>
          ) : (
            <div className="flex-1 border rounded-2xl flex items-center justify-center text-muted-foreground bg-white border-soft">
              Tidak ada soal aktif.
            </div>
          )}

          {/* Previous/Next Navigation Controls */}
          <NavigationPanel onSubmitClick={() => setShowSubmitModal(true)} />
        </div>

      </main>

      {/* Submit Confirmation Dialog */}
      <SubmitConfirmation
        open={showSubmitModal}
        onOpenChange={setShowSubmitModal}
        onConfirm={handleConfirmSubmit}
        isSubmitting={isSubmitting || finalizing}
      />

      {/* Blocking finalize overlay (#8): locks the screen while submitting/retrying. */}
      <ProcessingOverlay />
    </div>
  );
};
