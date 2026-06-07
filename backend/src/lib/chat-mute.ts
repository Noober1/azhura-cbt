/**
 * Azhura CBT Backend - Chat manual-mute registry (#17)
 *
 * Supervisor/admin moderation mutes, kept in Redis/Valkey so they survive a
 * backend restart and are enumerable for the console moderation panel. This is
 * distinct from the in-memory anti-spam auto-mute (`chat-rate-limiter.ts`):
 * those are transient and self-healing; these are deliberate and persist until
 * they expire (timed) or are explicitly lifted (indefinite).
 *
 * Each mute is a Redis HASH at `chat:mute:{userId}`:
 * - timed mute     → the key carries a TTL (`PEXPIREAT mutedUntil`); it
 *   auto-expires, so a forgotten mute never lingers forever.
 * - indefinite mute → no TTL; lifts only on explicit `unmute`.
 *
 * Mirrors `session-registry.ts`: a factory takes a Redis client (tests inject
 * `ioredis-mock`), and the production singleton binds the shared connection.
 */

import type { Redis } from "ioredis";
import type { MutedUser } from "@azhura/shared";
import { redis as sharedRedis } from "./redis";

/** Redis key prefix for chat mute entries. */
const KEY_PREFIX = "chat:mute:";
const keyFor = (userId: string): string => `${KEY_PREFIX}${userId}`;
const userIdFromKey = (key: string): string => key.slice(KEY_PREFIX.length);

/** Current mute status for a user. */
export interface MuteStatus {
  /** Epoch-ms the mute lifts, or null for an indefinite mute. */
  mutedUntil: number | null;
  reason: string;
}

/** Arguments for applying a mute. */
export interface MuteInput {
  userId: string;
  /** Muted user's display name (denormalized for the console list). */
  name: string;
  /** Epoch-ms the mute lifts; null/omitted ⇒ indefinite. */
  mutedUntil: number | null;
  /** User id of the supervisor/admin applying the mute. */
  by: string;
  reason: string;
}

/** The mute-registry surface consumed by the socket layer and supervisor routes. */
export interface ChatMuteRegistry {
  mute(input: MuteInput): Promise<void>;
  unmute(userId: string): Promise<void>;
  /** Returns the active mute for a user, or null when not muted. */
  isMuted(userId: string): Promise<MuteStatus | null>;
  /** Lists every active mute, for the console moderation panel. */
  listMuted(): Promise<MutedUser[]>;
}

/**
 * Builds a {@link ChatMuteRegistry} backed by the given Redis client. Exported so
 * tests can inject an in-memory client; production uses {@link chatMuteRegistry}.
 */
export const createChatMuteRegistry = (client: Redis): ChatMuteRegistry => {
  return {
    async mute({ userId, name, mutedUntil, by, reason }) {
      const key = keyFor(userId);
      await client.hset(key, {
        name,
        by,
        reason,
        mutedUntil: mutedUntil === null ? "" : String(mutedUntil),
      });
      // Timed mute auto-expires at `mutedUntil`; indefinite mute clears any TTL.
      if (mutedUntil === null) {
        await client.persist(key);
      } else {
        await client.pexpireat(key, mutedUntil);
      }
    },

    async unmute(userId) {
      await client.del(keyFor(userId));
    },

    async isMuted(userId) {
      const hash = await client.hgetall(keyFor(userId));
      if (!hash || Object.keys(hash).length === 0) return null;
      const mutedUntil = hash.mutedUntil ? Number(hash.mutedUntil) : null;
      // A timed mute whose deadline has passed is treated as lifted (covers the
      // brief gap before Redis evicts the key, and mock clients without TTLs).
      if (mutedUntil !== null && Date.now() >= mutedUntil) {
        await client.del(keyFor(userId));
        return null;
      }
      return { mutedUntil, reason: hash.reason ?? "" };
    },

    async listMuted() {
      // SCAN (not KEYS) so enumeration never blocks Redis on a large keyspace.
      const keys: string[] = [];
      let cursor = "0";
      do {
        const [next, batch] = await client.scan(
          cursor,
          "MATCH",
          `${KEY_PREFIX}*`,
          "COUNT",
          100
        );
        cursor = next;
        keys.push(...batch);
      } while (cursor !== "0");

      if (keys.length === 0) return [];

      const entries = await Promise.all(
        keys.map(async (key) => {
          const hash = await client.hgetall(key);
          if (!hash || Object.keys(hash).length === 0) return null;
          const mutedUntil = hash.mutedUntil ? Number(hash.mutedUntil) : null;
          if (mutedUntil !== null && Date.now() >= mutedUntil) return null;
          return {
            userId: userIdFromKey(key),
            name: hash.name ?? "",
            mutedUntil,
            by: hash.by ?? "",
            reason: hash.reason ?? "",
          } satisfies MutedUser;
        })
      );
      return entries.filter((e): e is MutedUser => e !== null);
    },
  };
};

/** Production mute registry bound to the shared Redis/Valkey connection. */
export const chatMuteRegistry: ChatMuteRegistry = createChatMuteRegistry(sharedRedis);
