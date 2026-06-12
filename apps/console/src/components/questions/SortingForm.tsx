import type { SortingConfig } from "@azhura/shared";
import { PlusIcon, TrashIcon } from "../ui/icons";
import { Tooltip } from "../ui/Tooltip";

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
  const items = config.items ?? [];

  function updateItem(idx: number, value: string) {
    const updated = items.map((it, i) => (i === idx ? value : it));
    onChange(buildConfig(updated));
  }

  function addItem() {
    onChange(buildConfig([...items, ""]));
  }

  function removeItem(idx: number) {
    if (items.length <= MIN_ITEMS) return;
    onChange(buildConfig(items.filter((_, i) => i !== idx)));
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const updated = [...items];
    [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
    onChange(buildConfig(updated));
  }

  function moveDown(idx: number) {
    if (idx === items.length - 1) return;
    const updated = [...items];
    [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
    onChange(buildConfig(updated));
  }

  return (
    <section className="space-y-3" data-tour-form="sorting-items">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">
          Item Urutan (Jawaban Benar) <span className="text-danger">*</span>
        </p>
        <span className="text-xs text-faint">{items.length} item</span>
      </div>

      <div className="space-y-2">
        {items.map((item, idx) => (
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
              <Tooltip label="Pindah ke atas">
                <button
                  type="button"
                  onClick={() => moveUp(idx)}
                  disabled={disabled || idx === 0}
                  aria-label="Pindah ke atas"
                  className="focus-ring rounded-md p-1.5 text-faint transition-colors hover:bg-surface-raised hover:text-ink disabled:opacity-30"
                >
                  ↑
                </button>
              </Tooltip>
              <Tooltip label="Pindah ke bawah">
                <button
                  type="button"
                  onClick={() => moveDown(idx)}
                  disabled={disabled || idx === items.length - 1}
                  aria-label="Pindah ke bawah"
                  className="focus-ring rounded-md p-1.5 text-faint transition-colors hover:bg-surface-raised hover:text-ink disabled:opacity-30"
                >
                  ↓
                </button>
              </Tooltip>
            </div>
            <Tooltip label={`Hapus item ${idx + 1}`}>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                disabled={disabled || items.length <= MIN_ITEMS}
                aria-label={`Hapus item ${idx + 1}`}
                className="focus-ring rounded-md p-1.5 text-faint transition-colors hover:bg-danger-wash hover:text-danger disabled:opacity-30"
              >
                <TrashIcon className="size-4" />
              </button>
            </Tooltip>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addItem}
        disabled={disabled}
        data-tour-form="sorting-add-item"
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
