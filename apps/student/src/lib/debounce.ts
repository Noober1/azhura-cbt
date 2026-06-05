/**
 * Azhura CBT App - Keyed Debouncer (#10 autosave)
 *
 * Coalesces rapid repeated calls for the same key into a single trailing
 * invocation. Used by the exam store to debounce the *outbound* per-question
 * answer POST: local persistence stays immediate, but the network write fires
 * only after the student stops changing a given question for `delayMs`.
 *
 * Keyed by `questionId` so changing question A never delays the flush of
 * question B. Side effects (timers) are isolated here so the store stays simple
 * and this stays unit-testable with fake timers.
 */

/** A debouncer scoped by key (e.g. questionId). */
export interface KeyedDebouncer<K> {
  /** (Re)schedules `fn` for `key`, replacing any pending call for that key. */
  schedule: (key: K, fn: () => void) => void;
  /** Cancels a pending call for `key`, if any. */
  cancel: (key: K) => void;
  /** Cancels every pending call. */
  cancelAll: () => void;
  /** Number of keys with a pending (not-yet-fired) call. */
  pendingCount: () => number;
}

/**
 * Creates a {@link KeyedDebouncer}. Each `schedule(key, fn)` resets the timer
 * for that key; when it elapses, the latest `fn` for the key runs once and the
 * key is cleared.
 *
 * @param delayMs Trailing delay in milliseconds.
 */
export const createKeyedDebouncer = <K>(delayMs: number): KeyedDebouncer<K> => {
  const timers = new Map<K, ReturnType<typeof setTimeout>>();

  const cancel = (key: K): void => {
    const timer = timers.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(key);
    }
  };

  return {
    schedule: (key, fn) => {
      cancel(key);
      const timer = setTimeout(() => {
        timers.delete(key);
        fn();
      }, delayMs);
      timers.set(key, timer);
    },
    cancel,
    cancelAll: () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
    pendingCount: () => timers.size,
  };
};
