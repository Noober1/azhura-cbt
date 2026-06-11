/**
 * Azhura CBT Console — shared Motion (motion.dev) presets.
 *
 * One source of truth for the console's transitions so every surface feels the
 * same: short, decisive, snappy — aligned with the neobrutalist direction, not
 * floaty. We animate ONLY compositor-friendly properties (`transform` /
 * `opacity`); never layout properties (width/height/top/left/margin/padding).
 *
 * Reduced motion is honoured at the call site via `useReducedMotion()` from
 * `motion/react`: components pass `reduce` into the helpers here, which collapse
 * the variants to opacity-only (or no movement) and zero out the duration. The
 * CSS `@media (prefers-reduced-motion: reduce)` block in index.css remains a
 * belt-and-braces fallback for non-Motion animations (e.g. driver.js).
 */

import type { Transition, Variants } from "motion/react";

/** Snappy, decisive timings — neobrutalist, no spring bounce. */
export const DURATION = {
  /** Micro-interactions and small UI shifts. */
  fast: 0.12,
  /** Route/page and modal transitions. */
  base: 0.18,
} as const;

/** Decisive easing curve (easeOut-like); shared by every transition. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Distance (px) of the small enter/exit translate. Kept tiny on purpose. */
const SHIFT = 6;

/**
 * Route/page transition. Short cross-fade with a small upward settle.
 * When `reduce` is set, motion collapses to a plain opacity fade (no translate).
 */
export function pageVariants(reduce: boolean): Variants {
  return {
    initial: { opacity: 0, y: reduce ? 0 : SHIFT },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduce ? 0 : -SHIFT },
  };
}

export function pageTransition(reduce: boolean): Transition {
  return { duration: reduce ? 0 : DURATION.base, ease: EASE_OUT };
}

/**
 * Modal scrim — fade only (it never moves).
 * `reduce` only zeroes the duration; opacity itself is harmless to animate.
 */
export const scrimVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export function scrimTransition(reduce: boolean): Transition {
  return { duration: reduce ? 0 : DURATION.fast, ease: EASE_OUT };
}

/**
 * Modal panel — fade + a small scale/translate so it "pops" in decisively.
 * When `reduce` is set, scale/translate are pinned and only opacity changes.
 */
export function panelVariants(reduce: boolean): Variants {
  return {
    initial: { opacity: 0, scale: reduce ? 1 : 0.97, y: reduce ? 0 : SHIFT },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: reduce ? 1 : 0.98, y: reduce ? 0 : 4 },
  };
}

export function panelTransition(reduce: boolean): Transition {
  return { duration: reduce ? 0 : DURATION.base, ease: EASE_OUT };
}

/**
 * List/table rows — tiny staggered fade-in on initial mount only.
 * The container drives the stagger; each row uses `rowItemVariants`.
 * With `reduce`, the stagger is removed (delayChildren/stagger = 0) and rows
 * appear without translating.
 */
export function listContainerVariants(reduce: boolean): Variants {
  return {
    initial: {},
    animate: {
      transition: {
        // Tiny gap so a full page feels alive without dragging.
        staggerChildren: reduce ? 0 : 0.025,
        delayChildren: 0,
      },
    },
  };
}

export function rowItemVariants(reduce: boolean): Variants {
  return {
    initial: { opacity: 0, y: reduce ? 0 : SHIFT },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: reduce ? 0 : DURATION.fast, ease: EASE_OUT },
    },
  };
}
