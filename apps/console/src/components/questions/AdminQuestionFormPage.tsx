/**
 * Azhura CBT Console — Admin Question Form Page.
 *
 * Full-page create/edit form for questions of any type (admin role).
 * Type selector at top switches between MC, fill-in-blank, matching, and sorting.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import type { QuestionType, FillInBlankConfig, MatchingConfig, SortingConfig } from "@azhura/shared";
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
import { FillInBlankForm } from "./FillInBlankForm";
import { MatchingForm } from "./MatchingForm";
import { SortingForm } from "./SortingForm";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];
const DEFAULT_OPTIONS = ["<p></p>", "<p></p>", "<p></p>", "<p></p>"];

const TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Pilihan Ganda",
  fill_in_blank: "Isi Jawaban",
  matching: "Pasangkan",
  sorting: "Urutkan",
};

const DEFAULT_FILL_IN_BLANK: FillInBlankConfig = { answer: "" };
const DEFAULT_MATCHING: MatchingConfig = { pairs: [{ left: "", right: "" }, { left: "", right: "" }] };
const DEFAULT_SORTING: SortingConfig = { items: ["", "", ""], correctOrder: [0, 1, 2] };

export function AdminQuestionFormPage() {
  const { examId, questionId } = useParams<{ examId: string; questionId: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(questionId);

  const [loadingQuestion, setLoadingQuestion] = useState(isEdit);
  const [questionType, setQuestionType] = useState<QuestionType>("multiple_choice");
  const [questionText, setQuestionText] = useState("<p></p>");
  const [options, setOptions] = useState<string[]>(DEFAULT_OPTIONS);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [fillInBlankConfig, setFillInBlankConfig] = useState<FillInBlankConfig>(DEFAULT_FILL_IN_BLANK);
  const [matchingConfig, setMatchingConfig] = useState<MatchingConfig>(DEFAULT_MATCHING);
  const [sortingConfig, setSortingConfig] = useState<SortingConfig>(DEFAULT_SORTING);
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
    const type = q.type ?? "multiple_choice";
    setQuestionType(type);
    if (type === "multiple_choice") {
      const opts = q.options.slice(0, MAX_OPTIONS);
      while (opts.length < MIN_OPTIONS) opts.push({ id: "", text: "<p></p>" });
      setOptions(opts.map((o) => o.text || "<p></p>"));
      const idx = q.options.findIndex((o) => o.id === q.correctOptionId);
      setCorrectIndex(idx >= 0 ? Math.min(idx, opts.length - 1) : 0);
    } else if (type === "fill_in_blank" && q.config) {
      setFillInBlankConfig(q.config as FillInBlankConfig);
    } else if (type === "matching" && q.config) {
      setMatchingConfig(q.config as MatchingConfig);
    } else if (type === "sorting" && q.config) {
      setSortingConfig(q.config as SortingConfig);
    }
  }

  function handleTypeChange(newType: QuestionType) {
    setQuestionType(newType);
    setError(null);
    // Reset config to defaults when type changes.
    if (newType === "fill_in_blank") setFillInBlankConfig(DEFAULT_FILL_IN_BLANK);
    if (newType === "matching") setMatchingConfig(DEFAULT_MATCHING);
    if (newType === "sorting") setSortingConfig(DEFAULT_SORTING);
    if (newType === "multiple_choice") {
      setOptions(DEFAULT_OPTIONS);
      setCorrectIndex(0);
    }
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
    if (questionType === "multiple_choice") {
      for (let i = 0; i < options.length; i++) {
        if (!options[i].replace(/<[^>]*>/g, "").trim())
          return `Opsi ${OPTION_LABELS[i]} tidak boleh kosong.`;
      }
    } else if (questionType === "fill_in_blank") {
      if (!fillInBlankConfig.answer.trim()) return "Jawaban benar tidak boleh kosong.";
    } else if (questionType === "matching") {
      for (const [i, pair] of matchingConfig.pairs.entries()) {
        if (!pair.left.trim() || !pair.right.trim())
          return `Pasangan ${i + 1} tidak boleh kosong.`;
      }
    } else if (questionType === "sorting") {
      for (const [i, item] of sortingConfig.items.entries()) {
        if (!item.trim()) return `Item ${i + 1} tidak boleh kosong.`;
      }
    }
    return null;
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!examId) return;

    const base = { text: questionText, type: questionType };
    const input =
      questionType === "multiple_choice"
        ? { ...base, options: options.map((o) => ({ text: o })), correctOptionIndex: correctIndex }
        : questionType === "fill_in_blank"
        ? { ...base, config: fillInBlankConfig }
        : questionType === "matching"
        ? { ...base, config: matchingConfig }
        : { ...base, config: sortingConfig };

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
        {/* Type selector */}
        <section className="space-y-2">
          <label className="block text-sm font-medium text-ink">Tipe Soal</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
              <button
                key={t}
                type="button"
                disabled={busy || isEdit}
                onClick={() => handleTypeChange(t)}
                className={`focus-ring rounded-[var(--radius-field)] border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                  questionType === t
                    ? "border-accent bg-accent text-white"
                    : "border-line bg-surface text-ink hover:bg-surface-raised"
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          {isEdit && (
            <p className="text-xs text-faint">Tipe soal tidak dapat diubah setelah dibuat.</p>
          )}
        </section>

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

        {/* Type-specific section */}
        {questionType === "multiple_choice" && (
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
        )}

        {questionType === "fill_in_blank" && (
          <FillInBlankForm
            config={fillInBlankConfig}
            onChange={setFillInBlankConfig}
            disabled={busy}
          />
        )}

        {questionType === "matching" && (
          <MatchingForm
            config={matchingConfig}
            onChange={setMatchingConfig}
            disabled={busy}
          />
        )}

        {questionType === "sorting" && (
          <SortingForm
            config={sortingConfig}
            onChange={setSortingConfig}
            disabled={busy}
          />
        )}

        {error && (
          <p className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 border-t border-line pt-4">
          <Button type="submit" busy={busy}>
            {isEdit ? "Perbarui Soal" : "Simpan Soal"}
          </Button>
          {questionType === "multiple_choice" && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              leadingIcon={<EyeIcon className="size-4" />}
              onClick={() => setPreviewOpen(true)}
            >
              Preview
            </Button>
          )}
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
