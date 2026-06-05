/**
 * Azhura CBT Backend - App-level heartbeat liveness tracker (#9)
 *
 * Socket.io's engine ping/pong only proves the *transport* is alive. A wedged
 * exam client — frozen tab, blocked JS event loop, suspended laptop resuming
 * with a stale socket — can keep the transport answering while the app is
 * effectively dead. This tracker drives an explicit *application-level*
 * ping/pong: the server pings on an interval and the client's JavaScript must
 * answer. A run of unanswered pings ("miss N") marks the peer dead.
 *
 * It is intentionally transport-agnostic and side-effect free, so the
 * miss-counting decision is unit-testable without a live socket. `socket.ts`
 * wires {@link HeartbeatTracker.recordPing} to the interval and
 * {@link HeartbeatTracker.recordPong} to the `heartbeat:pong` event.
 */

/** Construction options for {@link createHeartbeatTracker}. */
export interface HeartbeatTrackerOptions {
  /**
   * Consecutive *missed* pongs tolerated before the peer is considered dead.
   * Clamped to a floor of 1. With a ping every `intervalMs`, detection takes
   * roughly `maxMisses * intervalMs` of silence.
   */
  maxMisses: number;
}

/** Tracks consecutive missed pongs and decides when a peer has flatlined. */
export interface HeartbeatTracker {
  /**
   * Record that a ping is being sent this round. Returns `true` once the peer
   * has missed {@link HeartbeatTrackerOptions.maxMisses} consecutive pongs and
   * should be treated as dead; otherwise `false`.
   */
  recordPing(): boolean;
  /** Record a pong from the peer, resetting the miss streak to zero. */
  recordPong(): void;
  /** Consecutive missed pongs observed so far (diagnostics / tests). */
  readonly misses: number;
}

/**
 * Builds a {@link HeartbeatTracker}. The first ping of a healthy connection is
 * always in-flight (not yet a miss); a ping only counts as a miss once a *prior*
 * ping went unanswered. This keeps `maxMisses=1` from ever flatlining a healthy
 * peer on its very first, still-pending ping.
 */
export const createHeartbeatTracker = (
  options: HeartbeatTrackerOptions
): HeartbeatTracker => {
  const maxMisses = Math.max(1, Math.floor(options.maxMisses));
  let misses = 0;
  // Whether the most recent ping is still awaiting its pong.
  let awaitingPong = false;

  return {
    recordPing() {
      // A new ping while the previous one is still unanswered = one missed pong.
      if (awaitingPong) misses += 1;
      awaitingPong = true;
      return misses >= maxMisses;
    },
    recordPong() {
      awaitingPong = false;
      misses = 0;
    },
    get misses() {
      return misses;
    },
  };
};
