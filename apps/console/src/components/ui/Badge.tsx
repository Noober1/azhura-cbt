/**
 * Azhura CBT Console — Badge / status pill.
 */

import type { ReactNode } from "react";

type Tone = "neutral" | "positive" | "danger" | "accent" | "warn";

/* Flat `-wash` fill per tone, ink text, thick ink border (neobrutalist pill). */
const TONES: Record<Tone, string> = {
  neutral: "bg-surface",
  positive: "bg-positive-wash",
  danger: "bg-danger-wash",
  accent: "bg-accent-wash",
  warn: "bg-warn-wash",
};

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border-[2.5px] border-[var(--nb-ink)] px-2.5 py-0.5 text-xs font-bold text-ink ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
