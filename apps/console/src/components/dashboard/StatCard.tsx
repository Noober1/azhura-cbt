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
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${accentClass[accent]}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-sm text-faint">{sub}</p>}
    </div>
  );
}
