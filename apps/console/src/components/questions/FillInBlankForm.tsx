import type { FillInBlankConfig } from "@azhura/shared";
import { PlusIcon, TrashIcon } from "../ui/icons";
import { Tooltip } from "../ui/Tooltip";

interface Props {
  config: FillInBlankConfig;
  onChange: (config: FillInBlankConfig) => void;
  disabled?: boolean;
}

/**
 * Dynamic answer list for fill-in-blank questions.
 *
 * The first entry maps to `config.answers[0]` (primary answer). Additional
 * entries are alternative valid answers. When only one entry remains the
 * remove button is hidden. On save the parent sends `answers: string[]` and
 * keeps `answer` in sync with the primary entry for backward compatibility.
 */
export function FillInBlankForm({ config, onChange, disabled }: Props) {
  // Derive the working list from the config.
  // Backward compat: data with only `answer` (no `answers`) shows as one item.
  const answers: string[] = config.answers?.length
    ? config.answers
    : config.answer
    ? [config.answer]
    : [""];

  function updateAnswer(index: number, value: string) {
    const next = answers.map((a, i) => (i === index ? value : a));
    onChange({ answer: next[0] ?? "", answers: next });
  }

  function addAnswer() {
    const next = [...answers, ""];
    onChange({ answer: next[0] ?? "", answers: next });
  }

  function removeAnswer(index: number) {
    if (answers.length <= 1) return;
    const next = answers.filter((_, i) => i !== index);
    onChange({ answer: next[0] ?? "", answers: next });
  }

  return (
    <section className="space-y-3" data-tour-form="fib-answers">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-ink">
          Jawaban Benar <span className="text-danger">*</span>
        </label>
        <span className="text-xs text-faint">{answers.length} jawaban</span>
      </div>

      <div className="space-y-2">
        {answers.map((answer, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-center text-xs font-medium text-faint">
              {idx + 1}
            </span>
            <input
              type="text"
              value={answer}
              onChange={(e) => updateAnswer(idx, e.target.value)}
              disabled={disabled}
              placeholder={
                idx === 0
                  ? "Ketik jawaban yang benar (tidak peka huruf besar/kecil)…"
                  : "Jawaban alternatif yang juga diterima…"
              }
              className="flex-1 rounded-[var(--radius-field)] border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
            />
            {answers.length > 1 && (
              <Tooltip label={`Hapus jawaban ${idx + 1}`} className="inline-flex shrink-0">
                <button
                  type="button"
                  onClick={() => removeAnswer(idx)}
                  disabled={disabled}
                  aria-label={`Hapus jawaban ${idx + 1}`}
                  className="focus-ring rounded-md p-1.5 text-faint transition-colors hover:bg-danger-wash hover:text-danger disabled:opacity-40"
                >
                  <TrashIcon className="size-4" />
                </button>
              </Tooltip>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addAnswer}
        disabled={disabled}
        data-tour-form="fib-add-answer"
        className="focus-ring inline-flex items-center gap-1.5 rounded-[var(--radius-field)] px-2 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-wash disabled:opacity-40"
      >
        <PlusIcon className="size-4" />
        Tambah Jawaban Alternatif
      </button>

      <p className="text-xs text-faint">
        Jawaban siswa cocok jika sesuai dengan salah satu dari daftar di atas (tidak peka huruf
        besar/kecil, spasi di tepi diabaikan).
      </p>
    </section>
  );
}
