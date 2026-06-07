/**
 * Azhura CBT Backend - Supervisor Routes
 *
 * Realtime proctoring actions, all gated to `supervisor`/`admin` roles via a
 * `onBeforeHandle` guard. Each endpoint emits a Socket.io event to the targeted
 * student(s):
 * - `POST /api/supervisor/alert`        — send a toast message (one user or all).
 * - `POST /api/supervisor/force-submit` — force a student's exam to submit.
 * - `POST /api/supervisor/kick`         — revoke a student's access.
 */

import { Elysia, t } from "elysia";
import { asc } from "drizzle-orm";
import { db, schema } from "../db";
import { authPlugin } from "../middleware/requireAuth";
import { supervisorActions } from "../socket";
import { ForbiddenError, BadRequestError } from "../lib/errors";
import { getRecentLogs } from "../lib/log-files";
import { buildRosterSnapshot, hasActiveExam, listDashboardUserIds, buildRosterParticipant } from "../lib/roster";
import { sessionRegistry } from "../lib/session-registry";
import { notifyRosterPatch } from "../lib/roster-events";
import { kickStudent } from "../lib/proctor-actions";
import { applyTimeChange } from "../lib/time-control";
import { createLogger } from "../lib/logger";
import { writeEventLog } from "../lib/log-files";

const { groups } = schema;

const log = createLogger("Supervisor");

/**
 * Shared Elysia schema for a broadcast/time-change target: one student, one or
 * more groups, or everyone. Reused by `/alert` (#13) and `/time-change` (#8) so
 * the two stay in lockstep.
 */
const broadcastTargetSchema = t.Union([
  t.Object({ type: t.Literal("all") }),
  t.Object({ type: t.Literal("user"), userId: t.String() }),
  t.Object({
    type: t.Literal("group"),
    groupIds: t.Array(t.String(), { minItems: 1 }),
  }),
]);

/** Largest single time adjustment (minutes) a supervisor may apply (#8). */
const MAX_TIME_CHANGE_MINUTES = 180;

const DEFAULT_LOGOUT_REASON =
  "Anda dikeluarkan dari dashboard oleh pengawas. Silakan login kembali bila perlu.";

const DEFAULT_KICK_REASON = "Anda dikeluarkan dari ujian oleh pengawas.";

/**
 * Logs a single dashboard student out: releases their registry session, fires
 * the `kick` event (the client signs out), and removes them from the roster.
 * Returns false (and does nothing) if the student is mid-exam — those must be
 * handled via kick/remote-submit, never a plain dashboard logout (#7).
 */
async function logoutDashboardUser(userId: string, reason: string): Promise<boolean> {
  if (await hasActiveExam(userId)) return false;
  const active = await sessionRegistry.getActive(userId);
  if (active) await sessionRegistry.release(userId, active.sessionId);
  supervisorActions.kickUser(userId, reason);
  notifyRosterPatch({ type: "remove", userId });
  return true;
}

export const supervisorRoutes = new Elysia({ prefix: "/supervisor" })
  .use(authPlugin)

  // Restrict every route in this group to supervisors/admins.
  .onBeforeHandle(({ user }) => {
    if (user.role !== "supervisor" && user.role !== "admin") {
      throw new ForbiddenError("Akses ditolak.");
    }
  })

  /**
   * POST /api/supervisor/alert
   * Broadcasts a message (#13) to a target — one student, one or more groups, or
   * everyone — shown on the client as a toast (default) or a modal. Logged for
   * audit.
   */
  .post(
    "/alert",
    ({ body, user }) => {
      const variant = body.variant ?? "toast";
      supervisorActions.broadcastMessage(body.target, body.message, variant);
      log.info("Broadcast", { by: user.userId, target: body.target.type, variant });
      writeEventLog(
        "supervisor_action",
        `Broadcast pesan ke ${body.target.type}`,
        { action: "broadcast", target: body.target.type, variant },
        { id: user.userId, role: user.role }
      );
      return { success: true };
    },
    {
      body: t.Object({
        message: t.String({ minLength: 1 }),
        variant: t.Optional(t.Union([t.Literal("toast"), t.Literal("modal")])),
        target: broadcastTargetSchema,
      }),
    }
  )

  /**
   * POST /api/supervisor/time-change
   * Live time control (#8): adds or subtracts `deltaMinutes` of remaining time
   * for a target — one student, one or more groups, or everyone mid-exam. Each
   * affected student's client gets a `time-change` event (its countdown updates
   * live) and the supervisor roster is refreshed so the new remaining time shows
   * immediately. `end_time` is the source of truth; the adjustment is auditable
   * as `end_time − (start_time + duration·60000)` — no extra storage.
   */
  .post(
    "/time-change",
    async ({ body, user }) => {
      const { target, deltaMinutes } = body;
      if (deltaMinutes === 0) {
        throw new BadRequestError("Perubahan waktu tidak boleh nol.");
      }
      if (Math.abs(deltaMinutes) > MAX_TIME_CHANGE_MINUTES) {
        throw new BadRequestError(
          `Perubahan waktu maksimal ${MAX_TIME_CHANGE_MINUTES} menit per aksi.`
        );
      }

      const affected = await applyTimeChange(target, Math.round(deltaMinutes * 60_000));

      for (const session of affected) {
        // Push the new endTime live so the student's countdown updates instantly.
        supervisorActions.timeChangeUser(session.userId, session.endTime);
        // Refresh the monitoring roster row (its countdown derives from endTime).
        const participant = await buildRosterParticipant(session.userId);
        if (participant) notifyRosterPatch({ type: "upsert", participant });
      }

      log.info("Time change", {
        by: user.userId,
        target: target.type,
        deltaMinutes,
        count: affected.length,
      });
      writeEventLog(
        "supervisor_action",
        `Ubah waktu ujian (${deltaMinutes >= 0 ? "+" : ""}${deltaMinutes} menit)`,
        { action: "time_change", target: target.type, deltaMinutes, count: affected.length },
        { id: user.userId, role: user.role }
      );
      return { success: true, count: affected.length };
    },
    {
      body: t.Object({
        target: broadcastTargetSchema,
        deltaMinutes: t.Number(),
      }),
    }
  )

  /**
   * GET /api/supervisor/groups
   * Lists groups (id + name) for the broadcast target picker. Available to
   * supervisors (unlike the admin-only `/admin/groups` CRUD).
   */
  .get("/groups", async () => {
    return await db
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .orderBy(asc(groups.name));
  })

  /**
   * POST /api/supervisor/force-submit
   * Remote finish (#12): tells the targeted student's client to submit their
   * exam immediately, carrying an optional `reason` the client displays. The
   * student stays signed in and is routed to their result — unlike `kick`.
   */
  .post(
    "/force-submit",
    ({ body, user }) => {
      supervisorActions.forceSubmitUser(body.userId, body.reason);
      log.info("Force submit", { target: body.userId, by: user.userId });
      writeEventLog(
        "supervisor_action",
        "Paksa kumpulkan ujian peserta",
        { action: "force_submit", targetUserId: body.userId },
        { id: user.userId, role: user.role }
      );
      return { success: true };
    },
    {
      body: t.Object({
        userId: t.String(),
        reason: t.Optional(t.String()),
      }),
    }
  )

  /**
   * POST /api/supervisor/kick
   * Server-authoritative kick (#11): finalizes the student's exam server-side
   * (score computed even if the client never submitted), frees the single-session
   * lock (#5), tells the client to log out with the given reason, and removes the
   * student from the roster (#7). Works even if the student is already offline.
   */
  .post(
    "/kick",
    async ({ body, user }) => {
      const reason = body.reason?.trim() || DEFAULT_KICK_REASON;
      const { finalized } = await kickStudent(body.userId, reason);
      log.info("Kick", { target: body.userId, by: user.userId, finalized });
      writeEventLog(
        "supervisor_action",
        "Keluarkan peserta dari ujian (kick)",
        { action: "kick", targetUserId: body.userId, finalized },
        { id: user.userId, role: user.role }
      );
      return { success: true, finalized };
    },
    {
      body: t.Object({
        userId: t.String(),
        reason: t.Optional(t.String()),
      }),
    }
  )

  /**
   * GET /api/supervisor/roster
   * Backfills the live participant roster (#7): every student currently working
   * on an exam, with connection status and remaining-time bounds. The console
   * fetches this once on mount, then stays live via the `roster-update` event.
   */
  .get("/roster", async () => await buildRosterSnapshot())

  /**
   * POST /api/supervisor/dashboard-logout
   * Remote-logs-out students idle on the dashboard (#7). With `userId`, logs out
   * that one student; without it, logs out everyone currently on the dashboard.
   * Students who are mid-exam are never affected — that guard is enforced here,
   * not just in the UI, to prevent accidentally signing out an active test-taker.
   */
  .post(
    "/dashboard-logout",
    async ({ body, user }) => {
      const reason = body.reason?.trim() || DEFAULT_LOGOUT_REASON;

      if (body.userId) {
        const ok = await logoutDashboardUser(body.userId, reason);
        if (!ok) {
          throw new BadRequestError(
            "Peserta sedang mengerjakan ujian. Gunakan kick atau remote submit, bukan logout dashboard."
          );
        }
        log.info("Dashboard logout (single)", { target: body.userId, by: user.userId });
        return { success: true, count: 1 };
      }

      const dashboardUserIds = await listDashboardUserIds();
      const results = await Promise.all(
        dashboardUserIds.map((id) => logoutDashboardUser(id, reason))
      );
      const count = results.filter(Boolean).length;
      log.info("Dashboard logout (all)", { count, by: user.userId });
      return { success: true, count };
    },
    {
      body: t.Object({
        userId: t.Optional(t.String()),
        reason: t.Optional(t.String()),
      }),
    }
  )

  /**
   * GET /api/supervisor/logs
   * Backfills recent warn/error/access log entries for the dashboard, which
   * then receives subsequent entries live via the `log-entry` socket event.
   * Optional `?stream=error|warn|access` narrows the result.
   */
  .get(
    "/logs",
    ({ query }) => ({ logs: getRecentLogs(query.stream) }),
    {
      query: t.Object({
        stream: t.Optional(
          t.Union([t.Literal("error"), t.Literal("warn"), t.Literal("access")])
        ),
      }),
    }
  );
