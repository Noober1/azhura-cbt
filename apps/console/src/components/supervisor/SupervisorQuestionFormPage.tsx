/**
 * Azhura CBT Console — Supervisor Question Form Page (#88).
 *
 * Full-page create/edit form for a multiple-choice question.
 * Detect mode from route params: if `:questionId` is present → edit, else → create.
 *
 * Layout:
 * - Teks Soal → RichTextEditor (full block editor, supports KaTeX + media)
 * - Opsi A/B/C/D → InlineEditor per option (inline formatting + math)
 * - Jawaban Benar → radio (A/B/C/D)
 * - Simpan / Batal
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import type { AdminQuestion } from "../../types";
import { supervisorQuestionsApi } from "../../lib/supervisor-questions-api";
import { supervisorMediaApi } from "../../lib/supervisor-media-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { RichTextEditor } from "../editor/RichTextEditor";
import { InlineEditor } from "../editor/InlineEditor";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { ChevronLeftIcon } from "../ui/icons";

const OPTION_LABELS = ["A", "B", "C", "D"];
const EMPTY_OPTIONS = ["<p></p>", "<p></p>", "<p></p>", "<p></p>"];

export function SupervisorQuestionFormPage() {
  const { examId, questionId } = useParams<{ examId: string; questionId: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(questionId);

  const [loadingQuestion, setLoadingQuestion] = useState(isEdit);

  // Form state
  const [questionText, setQuestionText] = useState("<p></p>");
  const [options, setOptions] = useState<string[]>(EMPTY_OPTIONS);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing question in edit mode.
  const loadQuestion = useCallback(async () => {
    if (!examId || !questionId) return;
    try {
      setLoadingQuestion(true);
      const questions = await supervisorQuestionsApi.listQuestions(examId);
      const q = questions.find((q) => q.id === questionId);
      if (!q) {
        toast.error("Soal tidak ditemukan.");
        navigate(`/supervisor/exams/${examId}/questions`, { replace: true });
        return;
      }
      hydrate(q);
    } catch (err) {
      toast.error(getErrorMessage(err));
      navigate(`/supervisor/exams/${examId}/questions`, { replace: true });
    } finally {
      setLoadingQuestion(false);
    }
  }, [examId, questionId, navigate]);

  useEffect(() => {
    if (isEdit) loadQuestion();
  }, [isEdit, loadQuestion]);

  function hydrate(q: AdminQuestion) {
    setQuestionText(q.text || "<p></p>");
    const opts = q.options.slice(0, 4);
    while (opts.length < 4) opts.push({ id: "", text: "<p></p>" });
    setOptions(opts.map((o) => o.text || "<p></p>"));
    const idx = q.options.findIndex((o) => o.id === q.correctOptionId);
    setCorrectIndex(idx >= 0 ? Math.min(idx, 3) : 0);
  }

  function updateOption(idx: number, val: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? val : o)));
  }

  function validate(): string | null {
    const textStripped = questionText.replace(/<[^>]*>/g, "").trim();
    if (!textStripped) return "Teks soal tidak boleh kosong.";
    for (let i = 0; i < 4; i++) {
      const stripped = options[i].replace(/<[^>]*>/g, "").trim();
      if (!stripped) return `Opsi ${OPTION_LABELS[i]} tidak boleh kosong.`;
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!examId) return;
    const input = {
      text: questionText,
      options: options.map((o) => ({ text: o })),
      correctOptionIndex: correctIndex,
    };

    try {
      setBusy(true);
      if (isEdit && questionId) {
        await supervisorQuestionsApi.updateQuestion(examId, questionId, input);
        toast.success("Soal berhasil diperbarui.");
      } else {
        await supervisorQuestionsApi.createQuestion(examId, input);
        toast.success("Soal berhasil disimpan.");
      }
      navigate(`/supervisor/exams/${examId}/questions`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loadingQuestion) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to={`/supervisor/exams/${examId}/questions`}
          className="focus-ring inline-flex items-center gap-1 rounded-md text-sm text-faint hover:text-ink"
        >
          <ChevronLeftIcon className="size-4" />
          Daftar Soal
        </Link>
        <span className="text-faint">/</span>
        <h1 className="text-lg font-semibold text-ink">
          {isEdit ? "Edit Soal" : "Tambah Soal"}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Question text */}
        <section className="space-y-2">
          <label className="block text-sm font-medium text-ink">
            Teks Soal <span className="text-danger">*</span>
          </label>
          <RichTextEditor
            value={questionText}
            onChange={setQuestionText}
            placeholder="Tulis teks soal di sini…"
            disabled={busy}
            mediaListFn={supervisorMediaApi.list}
            mediaUploadFn={supervisorMediaApi.upload}
          />
        </section>

        {/* Options */}
        <section className="space-y-3">
          <p className="text-sm font-medium text-ink">
            Opsi Jawaban <span className="text-danger">*</span>
          </p>
          {OPTION_LABELS.map((label, idx) => (
            <div key={label} className="flex items-start gap-3">
              {/* Correct answer radio */}
              <label className="flex cursor-pointer items-center gap-2 pt-2.5">
                <input
                  type="radio"
                  name="correctIndex"
                  value={idx}
                  checked={correctIndex === idx}
                  onChange={() => setCorrectIndex(idx)}
                  disabled={busy}
                  className="accent-accent size-3.5"
                />
                <span
                  className={`text-sm font-semibold ${
                    correctIndex === idx ? "text-accent" : "text-faint"
                  }`}
                >
                  {label}
                </span>
              </label>
              <div className="flex-1">
                <InlineEditor
                  value={options[idx]}
                  onChange={(val) => updateOption(idx, val)}
                  placeholder={`Teks opsi ${label}…`}
                  disabled={busy}
                />
              </div>
            </div>
          ))}
          <p className="text-xs text-faint">
            Pilih radio button di kiri untuk menandai jawaban yang benar.
          </p>
        </section>

        {/* Validation error */}
        {error && (
          <p className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 border-t border-line pt-4">
          <Button type="submit" busy={busy}>
            {isEdit ? "Perbarui Soal" : "Simpan Soal"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => navigate(`/supervisor/exams/${examId}/questions`)}
          >
            Batal
          </Button>
        </div>
      </form>
    </div>
  );
}
