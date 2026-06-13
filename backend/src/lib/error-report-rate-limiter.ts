/**
 * Azhura CBT Backend - Client error-report anti-spam rate limiter (#169)
 *
 * Pure, in-memory sliding-window limiter that caps "at most N reports per
 * window" per actor. A misbehaving (or crash-looping) client must not be able
 * to flood the shared log store / supervisor dashboard with `client_error`
 * entries, so the ingest endpoint soft-drops anything beyond the window.
 *
 * The clock is injected into every call, so decisions are fully deterministic
 * and unit-testable without timers — mirroring `chat-rate-limiter.ts`. State
 * lives in a process-local Map (a single backend instance owns ingest).
 */

/** Construction options for {@link createErrorReportRateLimiter}. */
export interface ErrorReportRateLimiterOptions {
  /** Sliding-window length, in ms, over which reports are counted. */
  windowMs: number;
  /** Maximum reports allowed within the window before further ones are dropped. */
  maxInWindow: number;
}

/** Result of an {@link ErrorReportRateLimiter.check}. */
export interface ErrorReportCheckResult {
  /** True when the report is within the window budget; false when it overflows. */
  allowed: boolean;
}

/** Per-actor anti-spam tracker. */
export interface ErrorReportRateLimiter {
  /**
   * Records an attempt by `key` (actor id) at time `now` and decides whether it
   * is within budget. Once {@link ErrorReportRateLimiterOptions.maxInWindow} is
   * reached inside the sliding window, further attempts return `allowed: false`
   * until older ones age out — no mute, just a soft drop.
   */
  check(key: string, now: number): ErrorReportCheckResult;
  /** Forgets an actor's window state. */
  clear(key: string): void;
}

/**
 * Builds an {@link ErrorReportRateLimiter}. Exported as a factory so tests
 * construct isolated instances; the ingest route holds one process-wide
 * instance.
 */
export const createErrorReportRateLimiter = (
  options: ErrorReportRateLimiterOptions
): ErrorReportRateLimiter => {
  const windowMs = Math.max(1, Math.floor(options.windowMs));
  const maxInWindow = Math.max(1, Math.floor(options.maxInWindow));
  const recentByKey = new Map<string, number[]>();

  return {
    check(key, now) {
      const cutoff = now - windowMs;
      const recent = (recentByKey.get(key) ?? []).filter((t) => t > cutoff);

      if (recent.length >= maxInWindow) {
        recentByKey.set(key, recent);
        return { allowed: false };
      }

      recent.push(now);
      recentByKey.set(key, recent);
      return { allowed: true };
    },

    clear(key) {
      recentByKey.delete(key);
    },
  };
};
