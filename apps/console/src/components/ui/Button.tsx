/**
 * Azhura CBT Console — Button primitive.
 *
 * Variants tuned for an admin workspace: a solid accent primary, a quiet bordered
 * secondary, a low-emphasis ghost, and a destructive danger. All share a focus
 * ring and a disabled/busy state.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
  leadingIcon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-strong active:bg-accent-strong shadow-sm shadow-accent/20",
  secondary:
    "bg-surface text-ink border border-line hover:border-faint hover:bg-canvas",
  ghost: "text-ink-soft hover:text-ink hover:bg-canvas",
  danger: "bg-danger text-white hover:brightness-95 active:brightness-90",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[0.8125rem] gap-1.5 rounded-[var(--radius-field)]",
  md: "h-10 px-4 text-sm gap-2 rounded-[var(--radius-field)]",
};

export function Button({
  variant = "primary",
  size = "md",
  busy = false,
  leadingIcon,
  className = "",
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`focus-ring inline-flex items-center justify-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      disabled={disabled || busy}
      {...rest}
    >
      {busy ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        leadingIcon
      )}
      {children}
    </button>
  );
}
