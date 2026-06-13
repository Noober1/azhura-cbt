/**
 * Azhura CBT App - Anti-Cheat Emit Throttle (#126)
 *
 * A tiny per-key min-interval gate. The anti-cheat store uses it to damp bursty
 * outbound violation emits (e.g. repeated Alt+Tab focus loss) so the supervisor
 * socket isn't flooded — the server applies its own throttle too, but gating on
 * the client first avoids the wasted round-trips entirely.
 *
 * Pure (clock injected) so it stays trivially unit-testable.
 */

/** A per-key min-interval gate. {@link createAntiCheatThrottle} builds one. */
export interface AntiCheatThrottle {
  /**
   * Returns true if `key` may fire at `now` (recording it), false if it last
   * fired within `minIntervalMs`.
   */
  allow: (key: string, now: number) => boolean;
}

/**
 * Creates an {@link AntiCheatThrottle}: a given key fires at most once per
 * `minIntervalMs`.
 *
 * @param minIntervalMs Minimum gap between accepted fires for the same key.
 */
export const createAntiCheatThrottle = (minIntervalMs: number): AntiCheatThrottle => {
  const lastFire = new Map<string, number>();
  return {
    allow: (key, now) => {
      const prev = lastFire.get(key);
      if (prev !== undefined && now - prev < minIntervalMs) return false;
      lastFire.set(key, now);
      return true;
    },
  };
};
