import { Redis } from "ioredis";
import { E2E_STUDENT, E2E_STUDENT_ALT } from "../data/users.ts";

const E2E_CLAIM_KEYS = [
  `session:active:${E2E_STUDENT.id}`,
  `session:active:${E2E_STUDENT_ALT.id}`,
];

/**
 * Deletes the Redis session-claim keys for both e2e users so subsequent
 * logins are not blocked by the anti-multi-login guard (PENDING_TTL = 30s).
 * Called by resetE2ESessions() and the Playwright auto-cleanup fixture.
 */
export async function clearE2ERedisClaimsForE2EUsers(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
  try {
    await redis.del(...E2E_CLAIM_KEYS);
  } finally {
    redis.disconnect();
  }
}
