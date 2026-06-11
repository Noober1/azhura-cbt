/**
 * Azhura CBT App - Dashboard
 *
 * Landing surface after login. Fetches the list of exams the student may take
 * (`GET /exams`), renders the participant identity alongside the exam table,
 * and drives the start-exam confirmation flow: on confirm it opens a session
 * (`POST /exams/:examId/sessions`) and hands control to the exam screen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "../../stores/auth";
import { useExamStore } from "../../stores/exam";
import { useSocketStore } from "../../stores/socket";
import type { AvailableExam, ActiveSessionResponse } from "../../types";
import api from "../../lib/api";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { createLogger } from "../../lib/logger";
import { getErrorMessage, toErrorContext } from "../../lib/errors";
import { maybeAutoRunDashboardTour } from "../../lib/tour";
import { DashboardNavbar } from "./DashboardNavbar";
import { ParticipantCard } from "./ParticipantCard";
import { ExamListTable } from "./ExamListTable";
import { StartExamDialog } from "./StartExamDialog";
import { ChatDrawer } from "./ChatDrawer";

const log = createLogger("Dashboard");

interface DashboardPageProps {
  /** Navigates to the exam screen once a session has been opened (or resumed). */
  onExamStarted: () => void;
  /** Navigates to the result screen (e.g. an expired session finalized on resume). */
  onShowResult: () => void;
}

export const DashboardPage = ({ onExamStarted, onShowResult }: DashboardPageProps) => {
  const { user, token, userId } = useAuthStore();
  const { setExamSession } = useExamStore();
  const examListVersion = useSocketStore((state) => state.examListVersion);

  const [exams, setExams] = useState<AvailableExam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState<AvailableExam | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [startingExamId, setStartingExamId] = useState<string | null>(null);
  // Bumped each time a start attempt is rejected for a wrong access token (#47),
  // signalling the dialog to clear and refocus the OTP boxes.
  const [tokenRejectedNonce, setTokenRejectedNonce] = useState(0);
  // While true, an in-progress session check (#4) is running — render a spinner
  // so the exam list is never shown/clickable before a redirect decision.
  const [isCheckingResume, setIsCheckingResume] = useState(true);

  // Track mount status so async fetches never setState after unmount.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Fetches the available exams. `silent` skips the loading spinner and error
   * toast — used for realtime refreshes (#3) so the list updates unobtrusively.
   */
  const fetchExams = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const response = await api.get<AvailableExam[]>("/exams");
      if (isMountedRef.current) setExams(response.data);
    } catch (error) {
      log.error("Failed to load available exams", error, toErrorContext(error));
      if (isMountedRef.current && !silent) {
        toast.error(getErrorMessage(error, "Gagal memuat daftar ujian."));
      }
    } finally {
      if (isMountedRef.current && !silent) setIsLoading(false);
    }
  }, []);

  // Resume guard (#4): on entry, ask the server for any in-progress session and
  // redirect before showing the dashboard. Runs once on mount; uses store/prop
  // callbacks captured at mount (navigation intent doesn't change mid-session).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<ActiveSessionResponse>("/exams/sessions/active");
        if (cancelled) return;
        if (data.status === "resume") {
          await useExamStore
            .getState()
            .setExamSession({ ...data.session, serverTime: data.serverTime });
          onExamStarted();
          return;
        }
        if (data.status === "finalized") {
          useExamStore.getState().applyFinalizedResult(data.result, data.examTitle);
          onShowResult();
          return;
        }
      } catch (error) {
        // Fail-open: a resume-check failure must not lock the student out of
        // the dashboard. Log for tracing and continue to the normal flow.
        log.error("Resume check failed — proceeding to dashboard", error, toErrorContext(error));
      }
      if (!cancelled) setIsCheckingResume(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial load — only once the resume check cleared us to stay on the dashboard.
  useEffect(() => {
    if (!isCheckingResume) fetchExams();
  }, [fetchExams, isCheckingResume]);

  // First-run product tour (#145): auto-run once per participant, only after the
  // dashboard is actually shown (resume check cleared + exams settled, so the
  // [data-tour] anchors are mounted). The dashboard is a safe context — no exam-
  // scoped anti-cheat — so this carries no lockdown risk. `maybeAutoRun…` is a
  // no-op once the per-user "seen" flag is set, so re-runs from the deps are fine.
  const tourTriggeredRef = useRef(false);
  useEffect(() => {
    if (isCheckingResume || isLoading || tourTriggeredRef.current) return;
    tourTriggeredRef.current = true;
    void maybeAutoRunDashboardTour(userId);
  }, [isCheckingResume, isLoading, userId]);

  // Open the realtime connection while on the dashboard so the server can push
  // exam-list changes (#3). Connecting here — not only during an exam — is what
  // makes the list update live; the socket disconnects when leaving the page.
  // Deferred until the resume check clears, to avoid a connect/disconnect churn
  // when we're about to redirect away.
  useEffect(() => {
    if (isCheckingResume || !token) return;
    useSocketStore.getState().connect(token);
    return () => {
      useSocketStore.getState().disconnect();
    };
  }, [token, isCheckingResume]);

  // When the server signals a change, refetch silently and nudge the student.
  const isFirstVersionRef = useRef(true);
  useEffect(() => {
    if (isFirstVersionRef.current) {
      isFirstVersionRef.current = false;
      return;
    }
    fetchExams(true);
    toast.info("Daftar ujian diperbarui.");
  }, [examListVersion, fetchExams]);

  /** Opens the confirmation dialog for the chosen exam. */
  const handleSelectExam = (exam: AvailableExam) => {
    setSelectedExam(exam);
    setIsDialogOpen(true);
  };

  /**
   * Opens a session for the selected exam, then navigates to the exam screen.
   * `token` is the access token for token-gated exams (#1); the dialog is kept
   * open on failure so a wrong token can be corrected and retried.
   */
  const handleConfirmStart = async (token?: string) => {
    if (!selectedExam) return;

    setStartingExamId(selectedExam.id);
    try {
      const response = await api.post(
        `/exams/${selectedExam.id}/sessions`,
        token ? { token } : {}
      );
      await setExamSession(response.data);
      setIsDialogOpen(false);
      onExamStarted();
    } catch (error) {
      log.error("Failed to start exam session", error, {
        examId: selectedExam.id,
        ...toErrorContext(error),
      });
      const message = getErrorMessage(error, "Gagal memulai sesi ujian. Coba lagi.");
      toast.error(message);
      // A wrong access token (#47) surfaces as HTTP 403 from the session endpoint
      // when a token was supplied — and that's the only 403 reachable here (an
      // exam the student's group can't take isn't even listed). Keying on the
      // status, not the message text, avoids mistaking an expired-JWT 401 (whose
      // message also says "Token") for a bad access token. Signal the dialog to
      // clear + refocus the OTP so the student can retype immediately.
      if (token && isAxiosError(error) && error.response?.status === 403) {
        setTokenRejectedNonce((n) => n + 1);
      }
    } finally {
      setStartingExamId(null);
    }
  };

  // While the resume check is in flight, show a full-screen spinner instead of
  // the dashboard — the exam list must not be visible or clickable until we know
  // whether to redirect into an in-progress (or finalized) session (#4).
  if (isCheckingResume) {
    return (
      <div className="shell min-h-screen flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-foreground/70" />
        <p className="text-sm font-bold text-muted-foreground">Memeriksa sesi ujian…</p>
      </div>
    );
  }

  return (
    <div className="shell min-h-screen flex flex-col">
      <DashboardNavbar />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
            Selamat datang, {user?.name?.split(" ")[0] ?? "Peserta"}!
          </h1>
          <p className="text-sm font-medium text-muted-foreground">
            Berikut adalah ujian yang dapat Anda kerjakan hari ini.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left column: participant identity */}
          <div className="lg:col-span-1">
            <ParticipantCard user={user} />
          </div>

          {/* Right column: available exams */}
          <div className="lg:col-span-2">
            <ExamListTable
              exams={exams}
              isLoading={isLoading}
              startingExamId={startingExamId}
              onStart={handleSelectExam}
            />
          </div>
        </div>
      </main>

      <StartExamDialog
        exam={selectedExam}
        open={isDialogOpen}
        onOpenChange={(open) => {
          // Block closing the dialog mid-start to avoid orphaning the session.
          if (startingExamId) return;
          setIsDialogOpen(open);
        }}
        onConfirm={handleConfirmStart}
        isStarting={startingExamId !== null}
        tokenRejectedNonce={tokenRejectedNonce}
      />

      {/* Public chat (#17) — floating button + bottom drawer, dashboard-only. */}
      <ChatDrawer />
    </div>
  );
};

export default DashboardPage;
