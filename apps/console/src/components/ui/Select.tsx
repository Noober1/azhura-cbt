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
      className={`focus-ring h-10 w-full rounded-[var(--radius-field)] border border-line bg-surface px-3 text-sm text-ink transition-colors hover:border-faint disabled:opacity-60 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
