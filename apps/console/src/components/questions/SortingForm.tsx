import type { SortingConfig } from "@azhura/shared";
import { PlusIcon, TrashIcon } from "../ui/icons";

interface Props {
  config: SortingConfig;
  onChange: (config: SortingConfig) => void;
  disabled?: boolean;
}

const MIN_ITEMS = 3;

function buildConfig(items: string[]): SortingConfig {
  return { items, correctOrder: items.map((_, i) => i) };
}

export function SortingForm({ config, onChange, disabled }: Props) {
  function updateItem(idx: number, value: string) {
    const items = config.items.map((it, i) => (i === idx ? value : it));
    onChange(buildConfig(items));
  }

  function addItem() {
    onChange(buildConfig([...config.items, ""]));
  }

  function removeItem(idx: number) {
    if (config.items.length <= MIN_ITEMS) return;
    onChange(buildConfig(config.items.filter((_, i) => i !== idx)));
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const items = [...config.items];
    [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
    onChange(buildConfig(items));
  }

  function moveDown(idx: number) {
    if (idx === config.items.length - 1) return;
    const items = [...config.items];
    [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
    onChange(buildConfig(items));
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">
          Item Urutan (Jawaban Benar) <span className="text-danger">*</span>
        </p>
        <span className="text-xs text-faint">{config.items.length} item</span>
      </div>

      <div className="space-y-2">
        {config.items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-center text-xs font-semibold text-faint">
              {idx + 1}
            </span>
            <input
              type="text"
              value={item}
              onChange={(e) => updateItem(idx, e.target.value)}
              disabled={disabled}
              placeholder={`Item ${idx + 1}…`}
              className="flex-1 rounded-[var(--radius-field)] border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => moveUp(idx)}
                disabled={disabled || idx === 0}
                aria-label="Pindah ke atas"
                className="focus-ring rounded-md p-1.5 text-faint transition-colors hover:bg-surface-raised hover:text-ink disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveDown(idx)}
                disabled={disabled || idx === config.items.length - 1}
                aria-label="Pindah ke bawah"
                className="focus-ring rounded-md p-1.5 text-faint transition-colors hover:bg-surface-raised hover:text-ink disabled:opacity-30"
              >
                ↓
              </button>
            </div>
            <button
              type="button"
              onClick={() => removeItem(idx)}
              disabled={disabled || config.items.length <= MIN_ITEMS}
              aria-label={`Hapus item ${idx + 1}`}
              className="focus-ring rounded-md p-1.5 text-faint transition-colors hover:bg-danger-wash hover:text-danger disabled:opacity-30"
            >
              <TrashIcon className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addItem}
        disabled={disabled}
        className="focus-ring inline-flex items-center gap-1.5 rounded-[var(--radius-field)] px-2 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-wash disabled:opacity-40"
      >
        <PlusIcon className="size-4" />
        Tambah item
      </button>

      <p className="text-xs text-faint">
        Susun item dalam urutan yang benar. Urutan di form ini = urutan jawaban benar yang diharapkan. Lebih dari 50% posisi benar = nilai 1.
      </p>
    </section>
  );
}
