/**
 * Azhura CBT Backend - Active Session Registry (#5: single active session)
 *
 * Enforces "one student account → one active device" by tracking the currently
 * active session for each user in Redis/Valkey, keyed by `session:active:{userId}`.
 *
 * Each entry is a Redis HASH so conditional ("compare-and-set") operations can
 * match on the `sessionId` field directly in a Lua script — atomic, and without
 * relying on `cjson` (which keeps the logic portable to `ioredis-mock` in tests).
 *
 * Liveness model:
 * - `tryClaim` (login)  — create the entry only if none is alive (atomic NX),
 *   with a short `PENDING_TTL` window for the client to attach its WebSocket.
 * - `markConnected` (WS connect) — bind the entry to the live socket and refresh
 *   to `CONNECTED_TTL`. Rejected if the session was already replaced/expired.
 * - `refresh` (WS heartbeat) — extend `CONNECTED_TTL` while the socket is alive.
 * - `startGrace` (WS disconnect) — shrink TTL to `GRACE_TTL`; a reconnect with the
 *   same `sessionId` refreshes it back, otherwise it expires and frees the account.
 * - `release` (explicit logout) — delete the entry if it still owns the session.
 *
 * Because every state carries a TTL and `refresh` only runs while the socket is
 * truly alive, a crashed server (or dead client) can never deadlock an account:
 * the key always expires.
 */

import type { Redis } from "ioredis";
import { redis as sharedRedis } from "./redis";

/** Seconds a freshly-claimed session lives before its WebSocket attaches. */
export const PENDING_TTL = 30;
/** Seconds a connected session lives between heartbeat refreshes. */
export const CONNECTED_TTL = 30;
/** Seconds a disconnected session lingers before the account is freed. */
export const GRACE_TTL = 10;

/** Redis key for a user's active-session entry. */
const keyFor = (userId: string): string => `session:active:${userId}`;

/** Snapshot of an active session entry (as stored in the Redis hash). */
export interface ActiveSession {
  sessionId: string;
  status: "pending" | "connected";
  socketId: string | null;
  lastSeen: string;
}

// --- Lua scripts (atomic compare-and-set on the `sessionId` field) ----------

/** Create the entry only if none exists. Returns 1 on claim, 0 if already alive. */
const CLAIM_SCRIPT = `
if redis.call('exists', KEYS[1]) == 0 then
  redis.call('hset', KEYS[1], 'sessionId', ARGV[1], 'status', 'pending', 'socketId', '', 'lastSeen', ARGV[2])
  redis.call('expire', KEYS[1], ARGV[3])
  return 1
end
return 0`;

/** Bind to a live socket + refresh TTL, only if sessionId matches. */
const MARK_CONNECTED_SCRIPT = `
if redis.call('hget', KEYS[1], 'sessionId') == ARGV[1] then
  redis.call('hset', KEYS[1], 'status', 'connected', 'socketId', ARGV[2], 'lastSeen', ARGV[3])
  redis.call('expire', KEYS[1], ARGV[4])
  return 1
end
return 0`;

/** Extend TTL only if sessionId matches (heartbeat / grace). */
const EXPIRE_IF_OWNER_SCRIPT = `
if redis.call('hget', KEYS[1], 'sessionId') == ARGV[1] then
  redis.call('expire', KEYS[1], ARGV[2])
  return 1
end
return 0`;

/** Delete the entry only if sessionId matches. */
const RELEASE_SCRIPT = `
if redis.call('hget', KEYS[1], 'sessionId') == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

/** The session-registry surface consumed by auth routes and the socket server. */
export interface SessionRegistry {
  tryClaim(userId: string, sessionId: string): Promise<boolean>;
  markConnected(userId: string, sessionId: string, socketId: string): Promise<boolean>;
  refresh(userId: string, sessionId: string): Promise<boolean>;
  startGrace(userId: string, sessionId: string): Promise<boolean>;
  release(userId: string, sessionId: string): Promise<boolean>;
  getActive(userId: string): Promise<ActiveSession | null>;
}

/**
 * Builds a {@link SessionRegistry} backed by the given Redis client. Exported so
 * tests can inject an in-memory client; production code uses {@link sessionRegistry}.
 */
export const createSessionRegistry = (client: Redis): SessionRegistry => {
  const now = (): string => Date.now().toString();

  return {
    async tryClaim(userId, sessionId) {
      const result = await client.eval(
        CLAIM_SCRIPT,
        1,
        keyFor(userId),
        sessionId,
        now(),
        String(PENDING_TTL)
      );
      return result === 1;
    },

    async markConnected(userId, sessionId, socketId) {
      const result = await client.eval(
        MARK_CONNECTED_SCRIPT,
        1,
        keyFor(userId),
        sessionId,
        socketId,
        now(),
        String(CONNECTED_TTL)
      );
      return result === 1;
    },

    async refresh(userId, sessionId) {
      const result = await client.eval(
        EXPIRE_IF_OWNER_SCRIPT,
        1,
        keyFor(userId),
        sessionId,
        String(CONNECTED_TTL)
      );
      return result === 1;
    },

    async startGrace(userId, sessionId) {
      const result = await client.eval(
        EXPIRE_IF_OWNER_SCRIPT,
        1,
        keyFor(userId),
        sessionId,
        String(GRACE_TTL)
      );
      return result === 1;
    },

    async release(userId, sessionId) {
      const result = await client.eval(RELEASE_SCRIPT, 1, keyFor(userId), sessionId);
      return result === 1;
    },

    async getActive(userId) {
      const hash = await client.hgetall(keyFor(userId));
      if (!hash || !hash.sessionId) return null;
      return {
        sessionId: hash.sessionId,
        status: hash.status === "connected" ? "connected" : "pending",
        socketId: hash.socketId ? hash.socketId : null,
        lastSeen: hash.lastSeen ?? "",
      };
    },
  };
};

/** Production registry bound to the shared Redis/Valkey connection. */
export const sessionRegistry: SessionRegistry = createSessionRegistry(sharedRedis);
