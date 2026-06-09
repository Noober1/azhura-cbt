import type { MatchingConfig } from "@azhura/shared";
import { PlusIcon, TrashIcon } from "../ui/icons";

interface Props {
  config: MatchingConfig;
  onChange: (config: MatchingConfig) => void;
  disabled?: boolean;
}

const MIN_PAIRS = 2;

export function MatchingForm({ config, onChange, disabled }: Props) {
  function updatePair(idx: number, side: "left" | "right", value: string) {
    const pairs = config.pairs.map((p, i) => (i === idx ? { ...p, [side]: value } : p));
    onChange({ pairs });
  }

  function addPair() {
    onChange({ pairs: [...config.pairs, { left: "", right: "" }] });
  }

  function removePair(idx: number) {
    if (config.pairs.length <= MIN_PAIRS) return;
    onChange({ pairs: config.pairs.filter((_, i) => i !== idx) });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">
          Pasangan Jawaban <span className="text-danger">*</span>
        </p>
        <span className="text-xs text-faint">
          {config.pairs.length} pasangan
        </span>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-faint">
          <span className="px-1">Kolom A</span>
          <span className="px-1">Kolom B (pasangan)</span>
          <span />
        </div>

        {config.pairs.map((pair, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <input
              type="text"
              value={pair.left}
              onChange={(e) => updatePair(idx, "left", e.target.value)}
              disabled={disabled}
              placeholder={`A${idx + 1}…`}
              className="rounded-[var(--radius-field)] border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
            />
            <input
              type="text"
              value={pair.right}
              onChange={(e) => updatePair(idx, "right", e.target.value)}
              disabled={disabled}
              placeholder={`B${idx + 1}…`}
              className="rounded-[var(--radius-field)] border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => removePair(idx)}
              disabled={disabled || config.pairs.length <= MIN_PAIRS}
              aria-label={`Hapus pasangan ${idx + 1}`}
              className="focus-ring rounded-md p-1.5 text-faint transition-colors hover:bg-danger-wash hover:text-danger disabled:opacity-30"
            >
              <TrashIcon className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addPair}
        disabled={disabled}
        className="focus-ring inline-flex items-center gap-1.5 rounded-[var(--radius-field)] px-2 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-wash disabled:opacity-40"
      >
        <PlusIcon className="size-4" />
        Tambah pasangan
      </button>

      <p className="text-xs text-faint">
        Setiap baris A harus dipasangkan dengan baris B yang sejajar. Lebih dari 50% pasangan benar = nilai 1.
      </p>
    </section>
  );
}
