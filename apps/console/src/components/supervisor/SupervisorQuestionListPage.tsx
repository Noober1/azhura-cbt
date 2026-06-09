/**
 * Azhura CBT Console — Supervisor Question List Page (#88).
 *
 * Lists all questions for an assigned exam. Supervisors can add, edit, and
 * delete questions from here. Question text is rendered as HTML so that
 * KaTeX math and embedded media display correctly.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import type { AdminQuestion } from "../../types";
import type { QuestionType, FillInBlankConfig } from "@azhura/shared";
import { supervisorQuestionsApi } from "../../lib/supervisor-questions-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { Spinner } from "../ui/Spinner";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PencilIcon, TrashIcon, PlusIcon, ChevronLeftIcon } from "../ui/icons";
import { QuestionContentRenderer } from "./QuestionContentRenderer";

const QUESTION_TYPE_LABELS: Record<QuestionType, { label: string; className: string }> = {
  multiple_choice: { label: "Pilihan Ganda", className: "bg-blue-50 text-blue-700 border-blue-200" },
  fill_in_blank:   { label: "Isi Jawaban",   className: "bg-violet-50 text-violet-700 border-violet-200" },
  matching:        { label: "Pasangkan",      className: "bg-amber-50 text-amber-700 border-amber-200" },
  sorting:         { label: "Urutkan",        className: "bg-teal-50 text-teal-700 border-teal-200" },
};

export function SupervisorQuestionListPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<AdminQuestion | null>(null);

  const load = useCallback(async () => {
    if (!examId) return;
    try {
      setLoading(true);
      const data = await supervisorQuestionsApi.listQuestions(examId);
      setQuestions(data);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!examId || !deleteTarget) return;
    await supervisorQuestionsApi.deleteQuestion(examId, deleteTarget.id);
    toast.success("Soal dihapus.");
    await load();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/supervisor/exams"
          className="focus-ring inline-flex items-center gap-1 rounded-md text-sm text-faint hover:text-ink"
        >
          <ChevronLeftIcon className="size-4" />
          Ujian
        </Link>
        <span className="text-faint">/</span>
        <h1 className="text-lg font-semibold text-ink">Daftar Soal</h1>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => navigate(`/supervisor/exams/${examId}/questions/new`)}
          leadingIcon={<PlusIcon className="size-4" />}
        >
          Tambah Soal
        </Button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : questions.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-faint">
          <p className="text-sm">Belum ada soal untuk ujian ini.</p>
          <Button
            size="sm"
            onClick={() => navigate(`/supervisor/exams/${examId}/questions/new`)}
          >
            Tambah soal pertama
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, idx) => {
            const correctOption = q.options.find((o) => o.id === q.correctOptionId);
            const qType = (q.type ?? "multiple_choice") as QuestionType;
            const typeMeta = QUESTION_TYPE_LABELS[qType];
            return (
              <div
                key={q.id}
                className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface"
              >
                <div className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 shrink-0 text-sm font-semibold text-faint">
                    {idx + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    {/* Question type indicator */}
                    <span className={`mb-1.5 inline-block rounded border px-2 py-0.5 text-xs font-medium ${typeMeta.className}`}>
                      {typeMeta.label}
                    </span>

                    {/* Question text (HTML rendered) */}
                    <QuestionContentRenderer html={q.text} className="prose-sm text-sm text-ink" />

                    {/* Options for multiple_choice */}
                    {qType === "multiple_choice" && q.options.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {q.options.map((opt, oi) => (
                          <li
                            key={opt.id}
                            className={`flex items-start gap-2 rounded-md px-2.5 py-1.5 text-xs ${
                              opt.id === q.correctOptionId
                                ? "bg-success/10 text-positive font-medium"
                                : "bg-canvas text-ink-soft"
                            }`}
                          >
                            <span className="shrink-0 font-semibold">
                              {String.fromCharCode(65 + oi)}.
                            </span>
                            <QuestionContentRenderer html={opt.text} />
                          </li>
                        ))}
                      </ul>
                    )}

                    {qType === "multiple_choice" && correctOption && (
                      <p className="mt-2 text-xs text-faint">
                        Jawaban benar:{" "}
                        <span className="font-medium text-positive">
                          {String.fromCharCode(
                            65 + q.options.findIndex((o) => o.id === q.correctOptionId)
                          )}
                        </span>
                      </p>
                    )}

                    {/* Correct answer for fill_in_blank */}
                    {qType === "fill_in_blank" && q.config && (
                      <p className="mt-2 text-xs text-faint">
                        Jawaban benar:{" "}
                        <span className="font-semibold text-positive">
                          {(q.config as FillInBlankConfig).answer}
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() =>
                        navigate(
                          `/supervisor/exams/${examId}/questions/${q.id}/edit`
                        )
                      }
                      className="focus-ring rounded-md p-1.5 text-faint hover:bg-canvas hover:text-ink"
                      title="Edit soal"
                    >
                      <PencilIcon className="size-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(q)}
                      className="focus-ring rounded-md p-1.5 text-faint hover:bg-danger/10 hover:text-danger"
                      title="Hapus soal"
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Soal?"
        message="Tindakan ini tidak dapat dibatalkan. Soal dan semua opsinya akan dihapus permanen."
        confirmLabel="Hapus"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
