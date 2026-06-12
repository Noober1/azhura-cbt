/**
 * Azhura CBT Console — Button primitive (neobrutalist).
 *
 * Bordered variants carry the signature treatment: 2.5px ink border, hard
 * offset shadow, hover lift, press-into-shadow active. Ghost stays flat
 * (no border/shadow) for low-emphasis actions.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "highlight" | "ghost" | "danger" | "danger-outline";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
  leadingIcon?: ReactNode;
}

/* Shared neobrutalist chrome for every bordered variant. */
const NB =
  "border-[2.5px] border-[var(--nb-ink)] shadow-[3px_3px_0_var(--nb-ink)] " +
  "transition-[transform,box-shadow,background-color] duration-[80ms] " +
  "hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_var(--nb-ink)] " +
  "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none " +
  "disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[3px_3px_0_var(--nb-ink)]";

const VARIANTS: Record<Variant, string> = {
  primary: `bg-accent text-white hover:bg-accent-strong ${NB}`,
  secondary: `bg-surface text-ink hover:bg-canvas ${NB}`,
  highlight: `bg-highlight text-ink ${NB}`,
  ghost: "text-ink-soft hover:text-ink hover:bg-canvas transition-colors",
  danger: `bg-danger text-white ${NB}`,
  // Bordered like secondary, but with a light destructive accent — for
  // "leave"-type actions (e.g. logout) that deserve the full neobrutalist
  // chrome without shouting like full danger red.
  "danger-outline": `bg-surface text-danger hover:bg-danger-wash ${NB}`,
};

const SIZES: Record<Size, string> = {
  sm: "h-[34px] px-3 text-[0.8125rem] gap-1.5 rounded-[var(--radius-field)]",
  md: "h-[42px] px-4 text-sm gap-2 rounded-[var(--radius-field)]",
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
      className={`focus-ring inline-flex items-center justify-center whitespace-nowrap font-bold disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
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
