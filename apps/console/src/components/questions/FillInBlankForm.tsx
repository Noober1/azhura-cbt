import type { FillInBlankConfig } from "@azhura/shared";

interface Props {
  config: FillInBlankConfig;
  onChange: (config: FillInBlankConfig) => void;
  disabled?: boolean;
}

export function FillInBlankForm({ config, onChange, disabled }: Props) {
  return (
    <section className="space-y-2">
      <label className="block text-sm font-medium text-ink">
        Jawaban Benar <span className="text-danger">*</span>
      </label>
      <input
        type="text"
        value={config.answer}
        onChange={(e) => onChange({ answer: e.target.value })}
        disabled={disabled}
        placeholder="Ketik jawaban yang benar (tidak peka huruf besar/kecil)…"
        className="w-full rounded-[var(--radius-field)] border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
      />
      <p className="text-xs text-faint">
        Jawaban siswa akan dicocokkan tanpa memperhatikan huruf besar/kecil dan spasi di tepi.
      </p>
    </section>
  );
}
