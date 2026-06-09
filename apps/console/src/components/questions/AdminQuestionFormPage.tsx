/**
 * Azhura CBT Console — Admin Question Form Page.
 *
 * Full-page create/edit form for a multiple-choice question (admin role).
 * Uses examsApi (admin endpoints) and mediaApi. Supports 2–6 dynamic options.
 * Mode is detected from route params: :questionId present → edit, else → create.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import type { AdminQuestion } from "../../types";
import { examsApi } from "../../lib/exams-api";
import { mediaApi } from "../../lib/media-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { RichTextEditor } from "../editor/RichTextEditor";
import { InlineEditor } from "../editor/InlineEditor";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { ChevronLeftIcon, EyeIcon, PlusIcon, TrashIcon } from "../ui/icons";
import { QuestionPreviewModal } from "../supervisor/QuestionPreviewModal";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];
const DEFAULT_OPTIONS = ["<p></p>", "<p></p>", "<p></p>", "<p></p>"];

export function AdminQuestionFormPage() {
  const { examId, questionId } = useParams<{ examId: string; questionId: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(questionId);

  const [loadingQuestion, setLoadingQuestion] = useState(isEdit);
  const [questionText, setQuestionText] = useState("<p></p>");
  const [options, setOptions] = useState<string[]>(DEFAULT_OPTIONS);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const loadQuestion = useCallback(async () => {
    if (!examId || !questionId) return;
    try {
      setLoadingQuestion(true);
      const exam = await examsApi.get(examId);
      const q = exam.questions.find((q) => q.id === questionId);
      if (!q) {
        toast.error("Soal tidak ditemukan.");
        navigate(`/exams/${examId}`, { replace: true });
        return;
      }
      hydrate(q);
    } catch (err) {
      toast.error(getErrorMessage(err));
      navigate(`/exams/${examId}`, { replace: true });
    } finally {
      setLoadingQuestion(false);
    }
  }, [examId, questionId, navigate]);

  useEffect(() => {
    if (isEdit) loadQuestion();
  }, [isEdit, loadQuestion]);

  function hydrate(q: AdminQuestion) {
    setQuestionText(q.text || "<p></p>");
    const opts = q.options.slice(0, MAX_OPTIONS);
    while (opts.length < MIN_OPTIONS) opts.push({ id: "", text: "<p></p>" });
    setOptions(opts.map((o) => o.text || "<p></p>"));
    const idx = q.options.findIndex((o) => o.id === q.correctOptionId);
    setCorrectIndex(idx >= 0 ? Math.min(idx, opts.length - 1) : 0);
  }

  function updateOption(idx: number, val: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? val : o)));
  }

  function addOption() {
    setOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, "<p></p>"]));
  }

  function removeOption(idx: number) {
    setOptions((prev) => {
      if (prev.length <= MIN_OPTIONS) return prev;
      return prev.filter((_, i) => i !== idx);
    });
    setCorrectIndex((ci) => {
      if (idx === ci) return 0;
      return idx < ci ? ci - 1 : ci;
    });
  }

  function validate(): string | null {
    if (!questionText.replace(/<[^>]*>/g, "").trim()) return "Teks soal tidak boleh kosong.";
    for (let i = 0; i < options.length; i++) {
      if (!options[i].replace(/<[^>]*>/g, "").trim())
        return `Opsi ${OPTION_LABELS[i]} tidak boleh kosong.`;
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
        await examsApi.updateQuestion(examId, questionId, input);
        toast.success("Soal berhasil diperbarui.");
      } else {
        await examsApi.createQuestion(examId, input);
        toast.success("Soal berhasil disimpan.");
      }
      navigate(`/exams/${examId}`);
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
          to={`/exams/${examId}`}
          className="focus-ring inline-flex items-center gap-1 rounded-md text-sm text-faint hover:text-ink"
        >
          <ChevronLeftIcon className="size-4" />
          Detail Ujian
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
            mediaListFn={mediaApi.list}
            mediaUploadFn={mediaApi.upload}
          />
        </section>

        {/* Options */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink">
              Opsi Jawaban <span className="text-danger">*</span>
            </p>
            <span className="text-xs text-faint">{options.length}/{MAX_OPTIONS}</span>
          </div>

          {options.map((opt, idx) => (
            <div key={OPTION_LABELS[idx]} className="flex items-start gap-3">
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
                <span className={`text-sm font-semibold ${correctIndex === idx ? "text-accent" : "text-faint"}`}>
                  {OPTION_LABELS[idx]}
                </span>
              </label>
              <div className="flex-1">
                <InlineEditor
                  value={opt}
                  onChange={(val) => updateOption(idx, val)}
                  placeholder={`Teks opsi ${OPTION_LABELS[idx]}…`}
                  disabled={busy}
                />
              </div>
              {options.length > MIN_OPTIONS && (
                <button
                  type="button"
                  onClick={() => removeOption(idx)}
                  disabled={busy}
                  aria-label={`Hapus opsi ${OPTION_LABELS[idx]}`}
                  className="focus-ring mt-2.5 rounded-md p-1.5 text-faint transition-colors hover:bg-danger-wash hover:text-danger disabled:opacity-40"
                >
                  <TrashIcon className="size-4" />
                </button>
              )}
            </div>
          ))}

          {options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={addOption}
              disabled={busy}
              className="focus-ring inline-flex items-center gap-1.5 rounded-[var(--radius-field)] px-2 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-wash disabled:opacity-40"
            >
              <PlusIcon className="size-4" />
              Tambah opsi
            </button>
          )}

          <p className="text-xs text-faint">
            Pilih radio button di kiri untuk menandai jawaban yang benar.
          </p>
        </section>

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
            leadingIcon={<EyeIcon className="size-4" />}
            onClick={() => setPreviewOpen(true)}
          >
            Preview
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => navigate(`/exams/${examId}`)}
          >
            Batal
          </Button>
        </div>
      </form>

      <QuestionPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        questionText={questionText}
        options={options}
        correctIndex={correctIndex}
      />
    </div>
  );
}
