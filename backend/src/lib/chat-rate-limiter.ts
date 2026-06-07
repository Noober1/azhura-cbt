/**
 * Azhura CBT Backend - Chat anti-spam rate limiter (#17)
 *
 * Pure, in-memory sliding-window limiter that enforces "at most N messages per
 * window" per user and, on violation, applies a temporary auto-mute. The clock
 * is injected into every call, so the miss/mute decisions are fully deterministic
 * and unit-testable without timers — mirroring `heartbeat.ts`.
 *
 * State lives in a process-local Map (a single backend instance owns the chat
 * room). Supervisor/admin *manual* mutes are separate and durable — see
 * `chat-mute.ts`.
 */

/** Construction options for {@link createChatRateLimiter}. */
export interface ChatRateLimiterOptions {
  /** Sliding-window length, in ms, over which messages are counted. */
  windowMs: number;
  /** Maximum messages allowed within the window before a mute triggers. */
  maxInWindow: number;
  /** Auto-mute duration, in ms, applied once the window limit is exceeded. */
  muteMs: number;
}

/** Result of a {@link ChatRateLimiter.check}. */
export interface RateCheckResult {
  /** True when the message is allowed; false when the sender is (now) muted. */
  allowed: boolean;
  /** Epoch-ms the auto-mute lifts, or null when the sender is not muted. */
  mutedUntil: number | null;
}

/** Per-user anti-spam tracker. */
export interface ChatRateLimiter {
  /**
   * Records an attempt by `userId` at time `now` and decides whether it is
   * allowed. Exceeding {@link ChatRateLimiterOptions.maxInWindow} within the
   * window starts a mute; further attempts are rejected until it lifts.
   */
  check(userId: string, now: number): RateCheckResult;
  /** Forgets a user's window/mute state (e.g. on disconnect). */
  clear(userId: string): void;
}

interface UserState {
  /** Epoch-ms timestamps of recent allowed messages, within the window. */
  recent: number[];
  /** Epoch-ms the current auto-mute lifts, or null when not muted. */
  mutedUntil: number | null;
}

/**
 * Builds a {@link ChatRateLimiter}. Exported as a factory so tests construct
 * isolated instances; the socket layer holds one process-wide instance.
 */
export const createChatRateLimiter = (
  options: ChatRateLimiterOptions
): ChatRateLimiter => {
  const windowMs = Math.max(1, Math.floor(options.windowMs));
  const maxInWindow = Math.max(1, Math.floor(options.maxInWindow));
  const muteMs = Math.max(0, Math.floor(options.muteMs));
  const states = new Map<string, UserState>();

  return {
    check(userId, now) {
      const state = states.get(userId) ?? { recent: [], mutedUntil: null };

      // Still serving an active auto-mute → reject without counting the attempt.
      if (state.mutedUntil !== null && now < state.mutedUntil) {
        states.set(userId, state);
        return { allowed: false, mutedUntil: state.mutedUntil };
      }
      // Mute has lapsed; clear it before evaluating the window.
      if (state.mutedUntil !== null) state.mutedUntil = null;

      // Drop timestamps that have aged out of the window, then count this attempt.
      const cutoff = now - windowMs;
      state.recent = state.recent.filter((t) => t > cutoff);

      if (state.recent.length >= maxInWindow) {
        // Window exceeded → start a mute and reject this attempt.
        state.mutedUntil = now + muteMs;
        state.recent = [];
        states.set(userId, state);
        return { allowed: false, mutedUntil: state.mutedUntil };
      }

      state.recent.push(now);
      states.set(userId, state);
      return { allowed: true, mutedUntil: null };
    },

    clear(userId) {
      states.delete(userId);
    },
  };
};
