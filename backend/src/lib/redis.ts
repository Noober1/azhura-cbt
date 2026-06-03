/**
 * Azhura CBT Backend - Redis/Valkey Client (singleton)
 *
 * A single shared `ioredis` connection used by the session registry
 * (`session-registry.ts`) to enforce single-active-session per student (#5).
 *
 * The connection is lazy (`lazyConnect`): it dials Redis on first command, so
 * importing this module never blocks startup. Connection-lifecycle events are
 * logged so a misconfigured/unreachable Redis is visible in the logs rather
 * than failing silently.
 */

import Redis from "ioredis";
import { getRedisConfig } from "./env";
import { createLogger } from "./logger";

const log = createLogger("Redis");

/** Shared Redis/Valkey connection (lazily connected on first command). */
export const redis = new Redis(getRedisConfig().url, {
  lazyConnect: true,
  // Keep retrying with capped backoff so a brief Redis blip self-heals instead
  // of permanently wedging session checks.
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

redis.on("connect", () => log.info("Connecting to Redis…"));
redis.on("ready", () => log.info("Redis connection ready."));
redis.on("error", (error) => log.error("Redis connection error", error));
redis.on("close", () => log.warn("Redis connection closed."));

/** Gracefully closes the Redis connection (call on process shutdown). */
export const closeRedis = async (): Promise<void> => {
  try {
    await redis.quit();
    log.info("Redis connection shut down cleanly.");
  } catch (error) {
    log.warn("Failed to close Redis connection cleanly.", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
};
