import { useEffect, useState } from "react";
import { useExamStore } from "../../stores/exam";
import { useAuthStore } from "../../stores/auth";
import { useSocketStore } from "../../stores/socket";
import { useConnectivityStore } from "../../stores/connectivity";
import { useConfigStore } from "../../stores/config";
import {
  startAntiCheatMonitoring,
  enterFullscreen,
  detectMultiMonitor,
} from "../../lib/anti-cheat-config";
import { enterKiosk, exitKiosk, listenKioskEvents } from "../../lib/kiosk";
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

  // 2. Anti-Cheat: L1 web/DOM monitoring + L2 Tauri kiosk window.
  useEffect(() => {
    // L1 listeners always attach; each handler self-gates on the config flags,
    // so a runtime toggle in the hidden panel (#42) takes effect immediately.
    const cleanMonitoring = startAntiCheatMonitoring();

    if (!config.enabled) {
      return () => cleanMonitoring();
    }

    if (config.fullscreen) enterFullscreen();
    void detectMultiMonitor();

    // L2: lock the OS window into kiosk mode and react to window-level events.
    void enterKiosk();
    const unlistenKiosk = listenKioskEvents();

    return () => {
      cleanMonitoring();
      void unlistenKiosk.then((off) => off());
      void exitKiosk();
    };
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-6">
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
        <span className="text-sm font-semibold text-neutral-500">Mempersiapkan lembar ujian...</span>
      </div>
    );
  }

  const activeQuestion = questions[currentQuestionIndex];

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50/50 dark:bg-neutral-950/80">
      {/* Top Header bar */}
      <header className="sticky top-0 z-40 w-full border-b border-neutral-200/50 bg-white/80 backdrop-blur-md dark:border-neutral-800/50 dark:bg-neutral-900/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          
          {/* Exam Title & Meta */}
          <div className="flex flex-col">
            <h1 className="font-bold text-base text-neutral-950 dark:text-neutral-50 truncate max-w-48 sm:max-w-xs md:max-w-md">
              {examTitle || "Ujian CBT Utama"}
            </h1>
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500">
              <span>Siswa: {user?.name}</span>
              <span>&bull;</span>
              <span>NIS: {user?.nis}</span>
            </div>
          </div>

          {/* Right Status Widgets */}
          <div className="flex items-center gap-3">
            {/* Connection Indicator */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                isOnline
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50"
                  : "bg-destructive/5 text-destructive border-destructive/20"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-destructive"}`} />
              <span className="hidden md:inline">{isOnline ? "Online" : "Offline Mode"}</span>
            </div>

            {/* Socket Status Indicator */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                isConnected
                  ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/50"
                  : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/50"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-blue-500" : "bg-amber-500"}`} />
              <span className="hidden md:inline">{isConnected ? "Server Realtime" : "Koneksi Bermasalah"}</span>
            </div>

            {/* Timer Countdown widget */}
            <TimerDisplay />
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
            <QuestionRenderer
              question={activeQuestion}
              questionNumber={currentQuestionIndex + 1}
            />
          ) : (
            <div className="flex-1 border rounded-2xl flex items-center justify-center text-neutral-400 bg-white dark:bg-neutral-900 border-neutral-200/60 dark:border-neutral-800">
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
