/**
 * Azhura CBT Console — Select primitive.
 *
 * Native <select> styled to match the Input control (same height, border, focus
 * ring). Native is kept for accessibility and keyboard behavior.
 */

import type { SelectHTMLAttributes } from "react";

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`focus-ring h-10 w-full rounded-[var(--radius-field)] border-[2.5px] border-[var(--nb-ink)] bg-surface px-3 text-sm font-medium text-ink transition-colors disabled:opacity-60 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
