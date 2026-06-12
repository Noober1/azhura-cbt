/**
 * Azhura CBT Console — Exam detail & question manager.
 *
 * Loads a single exam (with its questions, options, and answer key) and provides
 * full question CRUD: add/edit via dedicated full-page routes, delete via
 * <ConfirmDialog/>. Also surfaces exam metadata, an edit shortcut, and a live
 * lock banner when students are mid-exam (#46). The participant/session list and
 * reset action live on a dedicated page (<ExamSessionsPage/>, #59), linked from
 * the header.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { examsApi } from "../../lib/exams-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import type { AdminQuestion, ExamDetail, ExamSupervisorDetail } from "../../types";
import { Button } from "../ui/Button";
import { Spinner, CenterState } from "../ui/Spinner";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PageHelpButton } from "../ui/PageHelpButton";
import { runExamDetailTour } from "../../lib/exam-detail-tour";
import { destroyActivePageTour } from "../../lib/page-tours";
import { ExamFormModal } from "./ExamFormModal";
import { ExamContextCard } from "./ExamContextCard";
import { SupervisorAssignModal } from "./SupervisorAssignModal";
import { QuestionCard } from "../questions/QuestionCard";
import { QuestionListEmptyState } from "../questions/QuestionListEmptyState";
import {
  PlusIcon,
  PencilIcon,
  ChevronLeftIcon,
  AlertIcon,
  UsersIcon,
  ShieldIcon,
  PlayIcon,
} from "../ui/icons";

export function ExamDetailPage() {
  const { examId = "" } = useParams();
  const navigate = useNavigate();

  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [supervisors, setSupervisors] = useState<ExamSupervisorDetail[]>([]);
  const [supervisorModalOpen, setSupervisorModalOpen] = useState(false);

  const [examFormOpen, setExamFormOpen] = useState(false);
  const [deletingQuestion, setDeletingQuestion] = useState<AdminQuestion | null>(null);

  const loadSupervisors = useCallback(async () => {
    try {
      const data = await examsApi.listSupervisors(examId);
      setSupervisors(data);
    } catch {
      // non-critical — supervisors are a secondary section
    }
  }, [examId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const examData = await examsApi.get(examId);
      setExam(examData);
    } catch (err) {
      setError(getErrorMessage(err, "Gagal memuat ujian."));
    } finally {
      setLoading(false);
    }
  }, [examId]);

  const refresh = useCallback(async () => {
    try {
      const examData = await examsApi.get(examId);
      setExam(examData);
    } catch {
      // silent — polling errors don't surface to the user
    }
  }, [examId]);

  useEffect(() => {
    load();
    loadSupervisors();
  }, [load, loadSupervisors]);

  useEffect(() => {
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  // The tour overlay lives on document.body and survives React unmounts, so
  // tear it down when the operator navigates away mid-tour.
  useEffect(() => () => destroyActivePageTour(), []);

  async function confirmDeleteQuestion() {
    if (!deletingQuestion) return;
    try {
      await examsApi.removeQuestion(examId, deletingQuestion.id);
      toast.success("Soal dihapus.");
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal menghapus soal."));
      throw err;
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <CenterState>
          <Spinner className="size-6 text-accent" />
          <span>Memuat ujian…</span>
        </CenterState>
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="mx-auto max-w-4xl">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/exams")}
          leadingIcon={<ChevronLeftIcon className="size-4" />}
        >
          Kembali
        </Button>
        <CenterState>
          <span className="text-danger">{error ?? "Ujian tidak ditemukan."}</span>
          <Button variant="secondary" size="sm" onClick={load}>
            Coba lagi
          </Button>
        </CenterState>
      </div>
    );
  }

  const activeCount = exam.allowedGroups.reduce((n, g) => n + g.activeParticipants, 0);
  const isLocked = activeCount > 0;

  return (
    <div className="mx-auto max-w-4xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/exams")}
        leadingIcon={<ChevronLeftIcon className="size-4" />}
        className="-ml-2"
      >
        Semua ujian
      </Button>

      {/* Exam header card */}
      <div className="mt-3" data-tour-page="exam-info">
        <ExamContextCard
          title={exam.title}
          durationMinutes={exam.durationMinutes}
          isActive={exam.isActive}
          expiredAt={exam.expiredAt}
          token={exam.token}
          showToken
          randomizeQuestion={exam.randomizeQuestion}
          randomizeAnswer={exam.randomizeAnswer}
          batches={exam.batches}
          allowedGroupNames={exam.allowedGroups.map((g) => g.name)}
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => void runExamDetailTour()}
                leadingIcon={<PlayIcon className="size-4" />}
                aria-label="Mulai tur halaman detail ujian"
              >
                Tur halaman
              </Button>
              <PageHelpButton topic="examDetail" />
              {/* Divider separates the help affordances from the action buttons. */}
              <span className="h-6 w-px bg-line-soft" aria-hidden="true" />
              <Button
                variant="secondary"
                onClick={() => navigate(`/exams/${examId}/sessions`)}
                leadingIcon={<UsersIcon className="size-4" />}
                data-tour-page="sessions-button"
              >
                Status peserta
              </Button>
              <Button
                variant="secondary"
                onClick={() => setExamFormOpen(true)}
                leadingIcon={<PencilIcon className="size-4" />}
                data-tour-page="edit-exam"
              >
                Edit ujian
              </Button>
            </>
          }
        />
      </div>

      {/* Supervisors */}
      <div className="mt-8 flex items-end justify-between" data-tour-page="supervisors">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Pengawas</h2>
          <p className="mt-0.5 text-sm text-faint">
            {supervisors.length > 0
              ? `${supervisors.length} pengawas ditugaskan`
              : "Belum ada pengawas ditugaskan"}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => setSupervisorModalOpen(true)}
          leadingIcon={<ShieldIcon className="size-4" />}
        >
          Kelola pengawas
        </Button>
      </div>

      {supervisors.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {supervisors.map((s) => (
            <li
              key={s.userId}
              className="flex items-center gap-3 rounded-[var(--radius-card)] border-[2.5px] border-[var(--nb-ink)] bg-surface shadow-[3px_3px_0_var(--nb-ink)] px-4 py-3 text-sm"
            >
              <ShieldIcon className="size-4 shrink-0 text-accent" />
              <span className="font-medium text-ink">{s.name}</span>
              <span className="text-faint">({s.nis})</span>
            </li>
          ))}
        </ul>
      )}

      {/* Questions */}
      <div className="mt-8 flex items-end justify-between" data-tour-page="questions">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Soal</h2>
          <p className="mt-0.5 text-sm text-faint">
            {exam.questions.length > 0
              ? `${exam.questions.length} soal`
              : "Belum ada soal"}
          </p>
        </div>
        <Button
          onClick={() => navigate(`/exams/${examId}/questions/new`)}
          disabled={isLocked}
          leadingIcon={<PlusIcon className="size-4" />}
          data-tour-page="add-question"
        >
          Tambah soal
        </Button>
      </div>

      {isLocked && (
        <div className="mt-3 flex items-center gap-2 rounded-[var(--radius-card)] border border-[var(--color-warn)]/25 bg-[var(--color-warn)]/10 px-4 py-3 text-sm text-[var(--color-warn)]">
          <AlertIcon className="size-4 shrink-0" />
          <span>
            Kelola soal dikunci — <strong>{activeCount}</strong> peserta sedang mengerjakan ujian ini.
            Tambah, edit, dan hapus soal tidak tersedia.
          </span>
        </div>
      )}

      {exam.questions.length === 0 ? (
        <QuestionListEmptyState
          onAdd={() => navigate(`/exams/${examId}/questions/new`)}
          disabled={isLocked}
        />
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {exam.questions.map((q, index) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={index}
              disabled={isLocked}
              onEdit={() => navigate(`/exams/${examId}/questions/${q.id}/edit`)}
              onDelete={() => setDeletingQuestion(q)}
            />
          ))}
        </ol>
      )}

      {/* Modals */}
      <SupervisorAssignModal
        open={supervisorModalOpen}
        examId={examId}
        onClose={() => setSupervisorModalOpen(false)}
        onSaved={setSupervisors}
      />

      <ExamFormModal
        open={examFormOpen}
        exam={exam}
        onClose={() => setExamFormOpen(false)}
        onSaved={(saved) => {
          setExam(saved);
          setExamFormOpen(false);
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingQuestion)}
        title="Hapus soal?"
        message="Soal dan seluruh opsinya akan dihapus permanen."
        confirmLabel="Hapus soal"
        onConfirm={confirmDeleteQuestion}
        onClose={() => setDeletingQuestion(null)}
      />
    </div>
  );
}
