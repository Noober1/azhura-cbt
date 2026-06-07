/**
 * Azhura CBT Console — Exam detail & question manager.
 *
 * Loads a single exam (with its questions, options, and answer key) and provides
 * full question CRUD: add/edit via <QuestionFormModal/>, delete via
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
import { formatDateTime, formatDuration, isPast } from "../../lib/format";
import type { AdminQuestion, ExamDetail } from "../../types";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Spinner, CenterState } from "../ui/Spinner";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ExamFormModal } from "./ExamFormModal";
import { QuestionFormModal } from "../questions/QuestionFormModal";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ChevronLeftIcon,
  ClockIcon,
  KeyIcon,
  CheckIcon,
  AlertIcon,
  UsersIcon,
} from "../ui/icons";

export function ExamDetailPage() {
  const { examId = "" } = useParams();
  const navigate = useNavigate();

  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [examFormOpen, setExamFormOpen] = useState(false);
  const [questionFormOpen, setQuestionFormOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<AdminQuestion | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<AdminQuestion | null>(null);

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
  }, [load]);

  useEffect(() => {
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  function openAddQuestion() {
    setEditingQuestion(null);
    setQuestionFormOpen(true);
  }

  function openEditQuestion(q: AdminQuestion) {
    setEditingQuestion(q);
    setQuestionFormOpen(true);
  }

  function handleQuestionSaved() {
    setQuestionFormOpen(false);
    setEditingQuestion(null);
    load();
  }

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

  const nextOrderIndex =
    exam.questions.reduce((max, q) => Math.max(max, q.orderIndex), -1) + 1;

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
      <section className="mt-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {exam.isActive ? (
                <Badge tone="positive">Aktif</Badge>
              ) : (
                <Badge tone="neutral">Nonaktif</Badge>
              )}
              {isPast(exam.expiredAt) && <Badge tone="danger">Kedaluwarsa</Badge>}
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {exam.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-faint">
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon className="size-4" />
                {formatDuration(exam.durationMinutes)}
              </span>
              <span>Kedaluwarsa {formatDateTime(exam.expiredAt)}</span>
              {exam.token && (
                <span className="inline-flex items-center gap-1.5">
                  <KeyIcon className="size-4" />
                  <span className="tabular font-medium text-ink-soft">{exam.token}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => navigate(`/exams/${examId}/sessions`)}
              leadingIcon={<UsersIcon className="size-4" />}
            >
              Status peserta
            </Button>
            <Button
              variant="secondary"
              onClick={() => setExamFormOpen(true)}
              leadingIcon={<PencilIcon className="size-4" />}
            >
              Edit ujian
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4 text-xs text-faint">
          <span className="rounded-md bg-canvas px-2 py-1">
            Acak soal: {exam.randomizeQuestion ? "Ya" : "Tidak"}
          </span>
          <span className="rounded-md bg-canvas px-2 py-1">
            Acak jawaban: {exam.randomizeAnswer ? "Ya" : "Tidak"}
          </span>
          <span className="rounded-md bg-canvas px-2 py-1">
            Group: {exam.allowedGroups.length > 0
              ? exam.allowedGroups.map((g) => g.name).join(", ")
              : "—"}
          </span>
        </div>
      </section>

      {/* Questions */}
      <div className="mt-8 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Soal</h2>
          <p className="mt-0.5 text-sm text-faint">
            {exam.questions.length > 0
              ? `${exam.questions.length} soal`
              : "Belum ada soal"}
          </p>
        </div>
        <Button
          onClick={openAddQuestion}
          disabled={isLocked}
          leadingIcon={<PlusIcon className="size-4" />}
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
        <div className="mt-4 rounded-[var(--radius-card)] border border-dashed border-line bg-surface">
          <CenterState>
            <span>Tambahkan soal pertama untuk ujian ini.</span>
            <Button
              size="sm"
              onClick={openAddQuestion}
              disabled={isLocked}
              leadingIcon={<PlusIcon className="size-4" />}
            >
              Tambah soal
            </Button>
          </CenterState>
        </div>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {exam.questions.map((q, index) => (
            <li
              key={q.id}
              className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-wash text-xs font-semibold text-accent-strong tabular">
                    {index + 1}
                  </span>
                  <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-ink">
                    {q.text}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={isLocked ? undefined : () => openEditQuestion(q)}
                    disabled={isLocked}
                    aria-label={`Edit soal ${index + 1}`}
                    aria-disabled={isLocked}
                    className={`focus-ring rounded-md p-2 transition-colors ${
                      isLocked
                        ? "cursor-not-allowed text-faint/40"
                        : "text-faint hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    <PencilIcon className="size-4" />
                  </button>
                  <button
                    onClick={isLocked ? undefined : () => setDeletingQuestion(q)}
                    disabled={isLocked}
                    aria-label={`Hapus soal ${index + 1}`}
                    aria-disabled={isLocked}
                    className={`focus-ring rounded-md p-2 transition-colors ${
                      isLocked
                        ? "cursor-not-allowed text-faint/40"
                        : "text-faint hover:bg-danger-wash hover:text-danger"
                    }`}
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>
              </div>

              <ul className="mt-3 flex flex-col gap-1.5 pl-10">
                {q.options.map((opt, oi) => {
                  const isCorrect = opt.id === q.correctOptionId;
                  return (
                    <li
                      key={opt.id}
                      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${
                        isCorrect
                          ? "bg-positive-wash font-medium text-ink"
                          : "text-ink-soft"
                      }`}
                    >
                      <span className="grid size-5 shrink-0 place-items-center text-faint">
                        {isCorrect ? (
                          <CheckIcon className="size-4 text-positive" />
                        ) : (
                          <span className="text-xs tabular">
                            {String.fromCharCode(65 + oi)}
                          </span>
                        )}
                      </span>
                      <span className="whitespace-pre-wrap">{opt.text}</span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {/* Modals */}
      <ExamFormModal
        open={examFormOpen}
        exam={exam}
        onClose={() => setExamFormOpen(false)}
        onSaved={(saved) => {
          setExam(saved);
          setExamFormOpen(false);
        }}
      />

      <QuestionFormModal
        open={questionFormOpen}
        examId={examId}
        question={editingQuestion}
        nextOrderIndex={nextOrderIndex}
        onClose={() => {
          setQuestionFormOpen(false);
          setEditingQuestion(null);
        }}
        onSaved={handleQuestionSaved}
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
