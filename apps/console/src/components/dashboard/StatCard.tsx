interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  accent?: "default" | "positive" | "warn" | "danger";
}

const accentClass: Record<NonNullable<StatCardProps["accent"]>, string> = {
  default:  "text-ink",
  positive: "text-positive",
  warn:     "text-warn",
  danger:   "text-danger",
};

export function StatCard({ label, value, sub, accent = "default" }: StatCardProps) {
  return (
    <div className="rounded-[var(--radius-card)] border-[2.5px] border-[var(--nb-ink)] bg-surface p-5 shadow-[3px_3px_0_var(--nb-ink)]">
      <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{label}</p>
      <p className={`tabular mt-2 text-3xl font-extrabold tracking-tight ${accentClass[accent]}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-sm text-faint">{sub}</p>}
    </div>
  );
}
