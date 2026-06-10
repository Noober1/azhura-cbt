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
import { formatDateTime, formatDuration, isPast } from "../../lib/format";
import type { AdminQuestion, ExamDetail, ExamSupervisorDetail } from "../../types";
import type { QuestionType, FillInBlankConfig, MatchingConfig, SortingConfig } from "@azhura/shared";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Spinner, CenterState } from "../ui/Spinner";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ExamFormModal } from "./ExamFormModal";
import { SupervisorAssignModal } from "./SupervisorAssignModal";
import { QuestionContentRenderer } from "../supervisor/QuestionContentRenderer";
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
  ShieldIcon,
} from "../ui/icons";

function parseConfig<T>(raw: unknown): T | null {
  if (!raw) return null;
  if (typeof raw === "string") { try { return JSON.parse(raw) as T; } catch { return null; } }
  return raw as T;
}

const QUESTION_TYPE_LABELS: Record<QuestionType, { label: string; className: string }> = {
  multiple_choice: { label: "Pilihan Ganda", className: "bg-blue-50 text-blue-700 border-blue-200" },
  fill_in_blank:   { label: "Isi Jawaban",   className: "bg-violet-50 text-violet-700 border-violet-200" },
  matching:        { label: "Pasangkan",      className: "bg-amber-50 text-amber-700 border-amber-200" },
  sorting:         { label: "Urutkan",        className: "bg-teal-50 text-teal-700 border-teal-200" },
};

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
      <section className="mt-3 rounded-[var(--radius-card)] border-[2.5px] border-[var(--nb-ink)] bg-surface shadow-[3px_3px_0_var(--nb-ink)] p-5 sm:p-6">
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
          <span className="rounded-md bg-canvas px-2 py-1">
            Batch: {exam.batches.length > 0
              ? exam.batches.join(", ")
              : "Semua batch"}
          </span>
        </div>
      </section>

      {/* Supervisors */}
      <div className="mt-8 flex items-end justify-between">
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
          onClick={() => navigate(`/exams/${examId}/questions/new`)}
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
              onClick={() => navigate(`/exams/${examId}/questions/new`)}
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
              className="rounded-[var(--radius-card)] border-[2.5px] border-[var(--nb-ink)] bg-surface shadow-[3px_3px_0_var(--nb-ink)] p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-wash text-xs font-semibold text-accent-strong tabular">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    {(() => {
                      const qType = (q.type ?? "multiple_choice") as QuestionType;
                      const meta = QUESTION_TYPE_LABELS[qType];
                      return (
                        <span className={`mb-1.5 inline-block rounded border px-2 py-0.5 text-xs font-medium ${meta.className}`}>
                          {meta.label}
                        </span>
                      );
                    })()}
                    <QuestionContentRenderer html={q.text} className="text-sm font-medium leading-relaxed" />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={isLocked ? undefined : () => navigate(`/exams/${examId}/questions/${q.id}/edit`)}
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

              {q.type === "fill_in_blank" ? (
                <div className="mt-3 pl-10">
                  <span className="text-xs text-faint">
                    Jawaban benar:{" "}
                    <span className="font-semibold text-positive">
                      {parseConfig<FillInBlankConfig>(q.config)?.answer ?? "—"}
                    </span>
                  </span>
                </div>
              ) : q.type === "matching" ? (
                <div className="mt-3 pl-10 space-y-1">
                  <p className="text-xs font-medium text-faint">Pasangan benar:</p>
                  {(parseConfig<MatchingConfig>(q.config)?.pairs ?? []).map((pair, pi) => (
                    <div key={pi} className="flex items-center gap-2 text-xs text-ink-soft">
                      <span className="rounded bg-canvas px-1.5 py-0.5 font-medium">{pair.left || "—"}</span>
                      <span className="text-faint">→</span>
                      <span className="rounded bg-canvas px-1.5 py-0.5 font-medium">{pair.right || "—"}</span>
                    </div>
                  ))}
                </div>
              ) : q.type === "sorting" ? (
                <div className="mt-3 pl-10 space-y-1">
                  <p className="text-xs font-medium text-faint">Urutan benar:</p>
                  {(parseConfig<SortingConfig>(q.config)?.items ?? []).map((item, si) => (
                    <div key={si} className="flex items-center gap-2 text-xs text-ink-soft">
                      <span className="w-4 shrink-0 font-semibold text-faint">{si + 1}.</span>
                      <span>{item || "—"}</span>
                    </div>
                  ))}
                </div>
              ) : (
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
                        <QuestionContentRenderer html={opt.text} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
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
