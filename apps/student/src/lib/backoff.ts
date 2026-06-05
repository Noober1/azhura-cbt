/**
 * Azhura CBT App - Exponential Backoff (#10 autosave retry)
 *
 * Pure delay computation for the connectivity store's queue-flush retry loop.
 * When a batch flush fails while the queue is non-empty, the store reschedules
 * itself with an increasing delay (capped) so a flaky/overloaded server is not
 * hammered. Kept side-effect-free so the schedule is unit-testable in isolation.
 */

/** Tuning for {@link nextBackoffDelay}. All durations are milliseconds. */
export interface BackoffOptions {
  /** Delay for the first retry (attempt 0). */
  baseMs?: number;
  /** Hard ceiling — the delay never exceeds this. */
  capMs?: number;
  /** Growth multiplier per attempt. */
  factor?: number;
}

const DEFAULTS: Required<BackoffOptions> = {
  baseMs: 2_000,
  capMs: 30_000,
  factor: 2,
};

/**
 * Computes the delay before the given retry attempt using capped exponential
 * growth: `min(cap, base * factor^attempt)`.
 *
 * @param attempt Zero-based retry index (0 = first retry). Negative values are
 *                clamped to 0.
 * @returns The delay in milliseconds, never exceeding `capMs`.
 */
export const nextBackoffDelay = (
  attempt: number,
  options: BackoffOptions = {}
): number => {
  const { baseMs, capMs, factor } = { ...DEFAULTS, ...options };
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const raw = baseMs * factor ** safeAttempt;
  return Math.min(capMs, raw);
};
