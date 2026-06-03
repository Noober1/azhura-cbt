/**
 * Azhura CBT App - Dashboard
 *
 * Landing surface after login. Fetches the list of exams the student may take
 * (`GET /exams`), renders the participant identity alongside the exam table,
 * and drives the start-exam confirmation flow: on confirm it opens a session
 * (`POST /exams/:examId/sessions`) and hands control to the exam screen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "../../stores/auth";
import { useExamStore } from "../../stores/exam";
import { useSocketStore } from "../../stores/socket";
import type { AvailableExam } from "../../types";
import api from "../../lib/api";
import { toast } from "sonner";
import { createLogger } from "../../lib/logger";
import { getErrorMessage, toErrorContext } from "../../lib/errors";
import { DashboardNavbar } from "./DashboardNavbar";
import { ParticipantCard } from "./ParticipantCard";
import { ExamListTable } from "./ExamListTable";
import { StartExamDialog } from "./StartExamDialog";

const log = createLogger("Dashboard");

interface DashboardPageProps {
  /** Navigates to the exam screen once a session has been opened. */
  onExamStarted: () => void;
}

export const DashboardPage = ({ onExamStarted }: DashboardPageProps) => {
  const { user, token } = useAuthStore();
  const { setExamSession } = useExamStore();
  const examListVersion = useSocketStore((state) => state.examListVersion);

  const [exams, setExams] = useState<AvailableExam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState<AvailableExam | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [startingExamId, setStartingExamId] = useState<string | null>(null);

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

  // Initial load.
  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  // Open the realtime connection while on the dashboard so the server can push
  // exam-list changes (#3). Connecting here — not only during an exam — is what
  // makes the list update live; the socket disconnects when leaving the page.
  useEffect(() => {
    if (token) useSocketStore.getState().connect(token);
    return () => {
      useSocketStore.getState().disconnect();
    };
  }, [token]);

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

  /** Opens a session for the selected exam, then navigates to the exam screen. */
  const handleConfirmStart = async () => {
    if (!selectedExam) return;

    setStartingExamId(selectedExam.id);
    try {
      const response = await api.post(`/exams/${selectedExam.id}/sessions`);
      await setExamSession(response.data);
      setIsDialogOpen(false);
      onExamStarted();
    } catch (error) {
      log.error("Failed to start exam session", error, {
        examId: selectedExam.id,
        ...toErrorContext(error),
      });
      toast.error(getErrorMessage(error, "Gagal memulai sesi ujian. Coba lagi."));
    } finally {
      setStartingExamId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-tr from-indigo-950 via-slate-900 to-emerald-950">
      <DashboardNavbar />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Selamat datang, {user?.name?.split(" ")[0] ?? "Peserta"}!
          </h1>
          <p className="text-sm font-medium text-white/60">
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
      />
    </div>
  );
};

export default DashboardPage;
