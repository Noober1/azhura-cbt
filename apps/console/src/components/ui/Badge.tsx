/**
 * Azhura CBT Console — Badge / status pill.
 */

import type { ReactNode } from "react";

type Tone = "neutral" | "positive" | "danger" | "accent" | "warn";

const TONES: Record<Tone, string> = {
  neutral: "bg-canvas text-ink-soft border-line",
  positive: "bg-positive-wash text-positive border-positive/20",
  danger: "bg-danger-wash text-danger border-danger/20",
  accent: "bg-accent-wash text-accent-strong border-accent/20",
  warn: "bg-[var(--color-warn)]/12 text-[var(--color-warn)] border-[var(--color-warn)]/25",
};

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
