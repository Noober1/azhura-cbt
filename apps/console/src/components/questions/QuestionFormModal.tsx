/**
 * Azhura CBT Console — Question create/edit modal.
 *
 * Edits a question's text plus its option set, with a radio marking the correct
 * answer. Options are a dynamic list (min 2). Because the backend replaces the
 * whole option set on update (and keys the answer by index), this form always
 * submits `options` + `correctOptionIndex` — for both create and edit — which
 * keeps the index→id mapping unambiguous.
 */

import { useEffect, useState, type FormEvent } from "react";
import { examsApi } from "../../lib/exams-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import type { AdminQuestion } from "../../types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field, Textarea, Input } from "../ui/Field";
import { PlusIcon, TrashIcon } from "../ui/icons";

interface QuestionFormModalProps {
  open: boolean;
  examId: string;
  /** When provided, edits this question; otherwise creates a new one. */
  question?: AdminQuestion | null;
  /** Next order index for a newly created question. */
  nextOrderIndex: number;
  onClose: () => void;
  onSaved: () => void;
}

interface OptionDraft {
  /** Stable local key for list rendering (not the DB id). */
  key: string;
  text: string;
}

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

let optionKeySeq = 1;
const newOption = (text = ""): OptionDraft => ({ key: `o${optionKeySeq++}`, text });

function initialOptions(question?: AdminQuestion | null): OptionDraft[] {
  if (question && question.options.length >= MIN_OPTIONS) {
    return question.options.map((o) => newOption(o.text));
  }
  return [newOption(), newOption()];
}

function initialCorrectIndex(question?: AdminQuestion | null): number {
  if (!question) return 0;
  const idx = question.options.findIndex((o) => o.id === question.correctOptionId);
  return idx >= 0 ? idx : 0;
}

export function QuestionFormModal({
  open,
  examId,
  question,
  nextOrderIndex,
  onClose,
  onSaved,
}: QuestionFormModalProps) {
  const isEdit = Boolean(question);
  const [text, setText] = useState(question?.text ?? "");
  const [options, setOptions] = useState<OptionDraft[]>(() => initialOptions(question));
  const [correctIndex, setCorrectIndex] = useState(() => initialCorrectIndex(question));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset on each open so the reused (always-mounted) modal never shows stale
  // state when switching between add and editing different questions.
  useEffect(() => {
    if (!open) return;
    setText(question?.text ?? "");
    setOptions(initialOptions(question));
    setCorrectIndex(initialCorrectIndex(question));
    setError(null);
    setBusy(false);
  }, [open, question?.id]);

  function updateOption(key: string, value: string) {
    setOptions((opts) => opts.map((o) => (o.key === key ? { ...o, text: value } : o)));
  }

  function addOption() {
    setOptions((opts) => (opts.length >= MAX_OPTIONS ? opts : [...opts, newOption()]));
  }

  function removeOption(index: number) {
    setOptions((opts) => {
      if (opts.length <= MIN_OPTIONS) return opts;
      const next = opts.filter((_, i) => i !== index);
      return next;
    });
    // Keep the correct-answer pointer valid after a removal.
    setCorrectIndex((ci) => {
      if (index === ci) return 0;
      return index < ci ? ci - 1 : ci;
    });
  }

  function validate(): string | null {
    if (!text.trim()) return "Teks soal wajib diisi.";
    if (options.length < MIN_OPTIONS) return "Minimal 2 opsi jawaban.";
    if (options.some((o) => !o.text.trim())) return "Semua opsi jawaban harus diisi.";
    if (correctIndex < 0 || correctIndex >= options.length) {
      return "Pilih satu jawaban benar.";
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate();
    if (found) {
      setError(found);
      return;
    }

    const payload = {
      text: text.trim(),
      orderIndex: question?.orderIndex ?? nextOrderIndex,
      options: options.map((o) => ({ text: o.text.trim() })),
      correctOptionIndex: correctIndex,
    };

    setBusy(true);
    try {
      if (isEdit && question) {
        await examsApi.updateQuestion(examId, question.id, payload);
        toast.success("Soal diperbarui.");
      } else {
        await examsApi.createQuestion(examId, payload);
        toast.success("Soal ditambahkan.");
      }
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal menyimpan soal."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={isEdit ? "Edit Soal" : "Tambah Soal"}
      description="Pilih opsi yang benar dengan tombol radio di sebelah kiri."
      onClose={busy ? () => {} : onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" form="question-form" busy={busy}>
            {isEdit ? "Simpan perubahan" : "Tambah soal"}
          </Button>
        </>
      }
    >
      <form
        id="question-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        <Field label="Teks soal" required>
          {(id) => (
            <Textarea
              id={id}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError(null);
              }}
              rows={3}
              placeholder="Tulis pertanyaan di sini…"
              autoFocus
            />
          )}
        </Field>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[0.8125rem] font-medium text-ink">
              Opsi jawaban
            </span>
            <span className="text-xs text-faint">
              {options.length}/{MAX_OPTIONS}
            </span>
          </div>

          {options.map((opt, index) => {
            const isCorrect = index === correctIndex;
            return (
              <div
                key={opt.key}
                className={`flex items-center gap-2.5 rounded-[var(--radius-field)] border px-3 py-2 transition-colors ${
                  isCorrect ? "border-positive/40 bg-positive-wash" : "border-line bg-surface"
                }`}
              >
                <label className="flex cursor-pointer items-center" title="Tandai sebagai benar">
                  <input
                    type="radio"
                    name="correct-option"
                    checked={isCorrect}
                    onChange={() => {
                      setCorrectIndex(index);
                      if (error) setError(null);
                    }}
                    className="focus-ring size-4 accent-[var(--color-positive)]"
                    aria-label={`Tandai opsi ${index + 1} sebagai benar`}
                  />
                </label>
                <Input
                  value={opt.text}
                  onChange={(e) => {
                    updateOption(opt.key, e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={`Opsi ${index + 1}`}
                  className="h-9 border-0 bg-transparent px-0 hover:border-0 focus-visible:outline-0"
                />
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  disabled={options.length <= MIN_OPTIONS}
                  aria-label={`Hapus opsi ${index + 1}`}
                  className="focus-ring rounded-md p-1.5 text-faint transition-colors hover:bg-canvas hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <TrashIcon className="size-4" />
                </button>
              </div>
            );
          })}

          {options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={addOption}
              className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-field)] px-2 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-wash"
            >
              <PlusIcon className="size-4" />
              Tambah opsi
            </button>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-[var(--radius-field)] border border-danger/20 bg-danger-wash px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
