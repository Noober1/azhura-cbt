/**
 * Azhura CBT Console — `prefers-reduced-motion` hook (#180 / epic #179).
 *
 * A tiny, dependency-free media-query subscription. The tutorial carousel uses
 * it to swap auto-playing animated WebP for a static poster frame, so we read
 * `matchMedia` fresh on every subscribe/snapshot (no module-level caching) —
 * which also keeps it trivially mockable in unit tests.
 */

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/** True when the operator's OS/browser asks for less motion. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
