/**
 * Azhura CBT Backend — Admin Log Viewer Routes (#18)
 *
 * Admin-only, queryable history for the console log viewer. Realtime tail is
 * delivered separately over the `log-entry` socket event (both admins and
 * supervisors join the `supervisors` room), but the queryable/filterable
 * history endpoint is **admin-only** — supervisors get no log viewer.
 *
 * Endpoint (under `/api/admin`):
 * - `GET /admin/logs` — filtered, paginated page of persisted log entries.
 */

import { Elysia, t } from "elysia";
import { authPlugin } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { queryLogs } from "../../lib/log-store";

export const adminLogsRoutes = new Elysia({ prefix: "/admin" })
  .use(authPlugin)
  .onBeforeHandle(requireAdmin)

  /**
   * GET /api/admin/logs
   * Returns a filtered, paginated page of persisted logs (newest first).
   * All query params are optional; page/limit are clamped server-side.
   */
  .get(
    "/logs",
    ({ query }) =>
      queryLogs({
        stream: query.stream,
        eventType: query.eventType,
        actorId: query.actorId,
        from: query.from,
        to: query.to,
        page: query.page,
        limit: query.limit,
      }),
    {
      query: t.Object({
        stream: t.Optional(
          t.Union([
            t.Literal("error"),
            t.Literal("warn"),
            t.Literal("access"),
            t.Literal("event"),
          ])
        ),
        eventType: t.Optional(t.String()),
        actorId: t.Optional(t.String()),
        from: t.Optional(t.Numeric()),
        to: t.Optional(t.Numeric()),
        page: t.Optional(t.Numeric()),
        limit: t.Optional(t.Numeric()),
      }),
    }
  );
