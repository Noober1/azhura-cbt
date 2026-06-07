/**
 * Azhura CBT Console — Recap shared presentational bits (#19).
 *
 * Small building blocks reused by both recap tabs (per-paket & per-siswa): the
 * session status badge, a labelled statistic card, and the score cell with its
 * correct/wrong/empty breakdown. Kept here so the two tabs stay focused on data
 * loading and layout.
 */

import type { ReactNode } from "react";
import { Badge } from "../ui/Badge";
import type { RecapSessionStatus } from "../../types";

const STATUS: Record<
  RecapSessionStatus,
  { tone: "accent" | "positive" | "neutral"; label: string }
> = {
  in_progress: { tone: "accent", label: "Mengerjakan" },
  completed: { tone: "positive", label: "Selesai" },
  expired: { tone: "neutral", label: "Kedaluwarsa" },
};

export function RecapStatusBadge({ status }: { status: RecapSessionStatus }) {
  const { tone, label } = STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
}

/** A single labelled statistic in the recap summary row. */
export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}

/** Formats a nullable score (0–100) as a percentage, or an em dash. */
export function formatScore(score: number | null): string {
  return score === null ? "—" : String(score);
}

interface ScoreCellProps {
  score: number | null;
  totalCorrect: number;
  totalWrong: number;
  totalEmpty: number;
}

/**
 * The score column: the rounded percentage (em dash while in progress) plus a
 * compact Benar/Salah/Kosong breakdown beneath it.
 */
export function ScoreCell({ score, totalCorrect, totalWrong, totalEmpty }: ScoreCellProps) {
  return (
    <div>
      <span className="tabular text-base font-semibold text-ink">
        {formatScore(score)}
      </span>
      <div className="mt-0.5 flex items-center gap-2 text-xs text-faint">
        <span className="text-positive">B {totalCorrect}</span>
        <span className="text-danger">S {totalWrong}</span>
        <span>K {totalEmpty}</span>
      </div>
    </div>
  );
}
