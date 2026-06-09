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
import { sql, eq, and, gt } from "drizzle-orm";
import { db } from "../../db";
import { examSessions } from "../../db/schema";
import { io } from "../../socket";
import { redis } from "../../lib/redis";
import { authPlugin } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { createLogger } from "../../lib/logger";
import { deleteAllUploads } from "../../lib/upload";
import { ConflictError } from "../../lib/errors";

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

/** Deletes all media rows + physical files from disk. */
async function wipeMedia(): Promise<void> {
  await db.execute(sql`DELETE FROM media`);
  deleteAllUploads();
}

/**
 * Deletes all exam-related data in FK-safe order.
 * Throws if any session is currently in progress.
 * Does NOT touch users, groups, or media.
 */
async function countActiveSessions(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(examSessions)
    .where(and(eq(examSessions.submitted, 0), gt(examSessions.endTime, Date.now())));
  return Number(rows[0]?.count ?? 0);
}

async function wipeExams(): Promise<void> {
  const active = await countActiveSessions();
  if (active > 0) {
    throw new ConflictError(`Masih ada ${active} peserta yang sedang mengerjakan ujian. Selesaikan atau hentikan sesi terlebih dahulu.`);
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM cheat_logs`);
    await tx.execute(sql`DELETE FROM answers`);
    await tx.execute(sql`DELETE FROM session_questions`);
    await tx.execute(sql`DELETE FROM exam_sessions`);
    await tx.execute(sql`DELETE FROM exam_supervisors`);
    await tx.execute(sql`DELETE FROM exam_groups`);
    await tx.execute(sql`DELETE FROM options`);
    await tx.execute(sql`DELETE FROM questions`);
    await tx.execute(sql`DELETE FROM exams`);
  });
}

/**
 * Deletes all student accounts and their associated data.
 * Throws 409 if any session is currently in progress.
 * Force-disconnects all connected student sockets after wiping.
 * Does NOT touch admin/supervisor accounts, exams, questions, or media.
 */
async function wipeStudents(): Promise<void> {
  const active = await countActiveSessions();
  if (active > 0) {
    throw new ConflictError(`Masih ada ${active} peserta yang sedang mengerjakan ujian. Selesaikan atau hentikan sesi terlebih dahulu.`);
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      DELETE FROM cheat_logs WHERE session_id IN (
        SELECT id FROM exam_sessions WHERE user_id IN (
          SELECT id FROM users WHERE role = 'student'
        )
      )
    `);
    await tx.execute(sql`
      DELETE FROM answers WHERE session_id IN (
        SELECT id FROM exam_sessions WHERE user_id IN (
          SELECT id FROM users WHERE role = 'student'
        )
      )
    `);
    await tx.execute(sql`
      DELETE FROM session_questions WHERE session_id IN (
        SELECT id FROM exam_sessions WHERE user_id IN (
          SELECT id FROM users WHERE role = 'student'
        )
      )
    `);
    await tx.execute(sql`DELETE FROM exam_sessions WHERE user_id IN (SELECT id FROM users WHERE role = 'student')`);
    await tx.execute(sql`DELETE FROM chat_messages WHERE user_id IN (SELECT id FROM users WHERE role = 'student')`);
    await tx.execute(sql`DELETE FROM users WHERE role = 'student'`);
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
  })

  /** DELETE /api/admin/system/media — wipe all media rows + files from disk. */
  .delete("/system/media", async ({ user }) => {
    log.warn("Wiping all media", { adminId: user.userId });
    await wipeMedia();
    log.info("All media wiped.");
    return { ok: true };
  })

  /** DELETE /api/admin/system/exams — wipe all exams, questions, sessions, answers. */
  .delete("/system/exams", async ({ user }) => {
    log.warn("Wiping all exams", { adminId: user.userId });
    await wipeExams();
    log.info("All exams wiped.");
    try {
      io.emit("exam-list-updated");
    } catch (err) {
      log.error("Failed to broadcast exam-list-updated", err);
    }
    return { ok: true };
  })

  /** DELETE /api/admin/system/students — wipe all student accounts + their data. */
  .delete("/system/students", async ({ user }) => {
    log.warn("Wiping all students", { adminId: user.userId });
    await wipeStudents();

    // Flush Redis so stale student sessions don't linger.
    try {
      await redis.flushdb();
    } catch (err) {
      log.error("Failed to flush Redis during student wipe", err);
    }

    // Force-logout all student sockets currently connected (dashboard or idle).
    // Offline clients are handled on reconnect: validateToken() → 401 → logout.
    try {
      const sockets = await io.fetchSockets();
      for (const s of sockets) {
        if ((s.data as { role?: string }).role === "student") {
          s.emit("kick", { reason: "Akun Anda telah dihapus oleh admin." });
          s.disconnect(true);
        }
      }
      log.info("All student sockets force-disconnected.");
    } catch (err) {
      log.error("Failed to disconnect student sockets", err);
    }

    log.info("All students wiped.");
    return { ok: true };
  });
