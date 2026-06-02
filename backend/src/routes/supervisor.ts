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
import { authPlugin } from "../middleware/requireAuth";
import { supervisorActions } from "../socket";
import { ForbiddenError } from "../lib/errors";
import { getRecentLogs } from "../lib/log-files";

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
   * Sends an alert to a specific `userId`, or broadcasts to all students when
   * `userId` is omitted.
   */
  .post(
    "/alert",
    ({ body }) => {
      if (body.userId) {
        supervisorActions.alertUser(body.userId, body.message);
      } else {
        supervisorActions.alertAll(body.message);
      }
      return { success: true };
    },
    {
      body: t.Object({
        message: t.String({ minLength: 1 }),
        userId: t.Optional(t.String()),
      }),
    }
  )

  /**
   * POST /api/supervisor/force-submit
   * Instructs the targeted student's client to submit their exam immediately.
   */
  .post(
    "/force-submit",
    ({ body }) => {
      supervisorActions.forceSubmitUser(body.userId, body.reason);
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
   * Revokes the targeted student's exam access (client logs out).
   */
  .post(
    "/kick",
    ({ body }) => {
      supervisorActions.kickUser(body.userId, body.reason);
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
