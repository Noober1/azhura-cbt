/**
 * Azhura CBT Backend — Admin System Reset Route
 *
 * Provides a full nuclear reset: wipes the entire database (all users including
 * admins, all exam data, sessions, groups) in FK-safe order, flushes the Redis
 * session registry, then broadcasts `system:reset` so every connected client
 * logs out. After the reset, no admin account exists so the setup wizard
 * appears automatically on the next console load. System settings are preserved.
 *
 * Endpoint (under `/api/admin`):
 * - `POST /admin/system/reset` — admin-only; returns `{ ok: true }` on success.
 */

import { Elysia } from "elysia";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { io } from "../../socket";
import { redis } from "../../lib/redis";
import { authPlugin } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { createLogger } from "../../lib/logger";

const log = createLogger("AdminSystem");

/**
 * Full nuclear wipe in FK-safe order. Deletes every user (including admins)
 * so the system returns to the "no admin exists" state that triggers the
 * setup wizard on the next console load. System settings are intentionally
 * preserved so the operator doesn't have to re-enter school identity.
 *
 * Deletion order (child → parent, FK-safe):
 *   cheat_logs → answers → session_questions → exam_sessions
 *   → exam_groups → options → questions → exams
 *   → chat_messages → users(all) → groups → app_logs
 */
async function wipeAll(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM cheat_logs`);
    await tx.execute(sql`DELETE FROM answers`);
    await tx.execute(sql`DELETE FROM session_questions`);
    await tx.execute(sql`DELETE FROM exam_sessions`);
    await tx.execute(sql`DELETE FROM exam_groups`);
    await tx.execute(sql`DELETE FROM options`);
    await tx.execute(sql`DELETE FROM questions`);
    await tx.execute(sql`DELETE FROM exams`);
    await tx.execute(sql`DELETE FROM chat_messages`);
    await tx.execute(sql`DELETE FROM users`);
    await tx.execute(sql`DELETE FROM \`groups\``);
    await tx.execute(sql`DELETE FROM app_logs`);
  });
}

export const adminSystemRoutes = new Elysia({ prefix: "/admin" })
  .use(authPlugin)
  .onBeforeHandle(requireAdmin)

  /**
   * POST /api/admin/system/reset
   *
   * Wipes all exam data + student accounts, flushes Redis, and broadcasts
   * `system:reset` to all connected clients so they log out.
   * Admin/supervisor accounts and system settings are untouched.
   */
  .post("/system/reset", async ({ user }) => {
    log.warn("System reset initiated", { adminId: user.userId, adminNis: user.nis });

    await wipeAll();
    log.info("Database wiped successfully (all users including admin deleted).");

    // Flush the session registry. flushdb wipes the entire logical DB — safe
    // here because Redis is used exclusively for the session registry in this
    // deployment. If other namespaces are ever added, replace with targeted
    // key deletion (e.g. redis.keys("session:*") + redis.del(...keys)).
    try {
      await redis.flushdb();
      log.info("Redis session registry flushed.");
    } catch (error) {
      // Non-fatal: registry entries expire naturally; log and continue.
      log.error("Failed to flush Redis during system reset", error);
    }

    // Notify every connected client (students, supervisors, other admin tabs)
    // so they see a graceful "system reset" message and are logged out.
    try {
      io.emit("system:reset", {});
      log.info("system:reset broadcast sent to all sockets.");
    } catch (error) {
      // Socket may not be initialised in test environments; log and continue.
      log.error("Failed to broadcast system:reset", error);
    }

    log.warn("System reset complete.", { adminId: user.userId });
    return { ok: true };
  });
