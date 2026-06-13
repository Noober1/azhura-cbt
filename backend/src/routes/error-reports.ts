/**
 * Azhura CBT Backend — Client error / bug ingest route (#169, epic #168)
 *
 * A single authenticated endpoint that accepts client-originated error and bug
 * reports and funnels them into the shared log store as `event`-stream entries
 * (`client_error` for auto-captured crashes, `bug_report` for manual reports).
 * They then surface in the admin log viewer (#172) and the live tail — no new
 * table, no new dashboard.
 *
 * Design rules:
 * - **Any authenticated user** may report (student / supervisor / admin). NOT
 *   admin-gated — this is telemetry, not an admin action.
 * - **Fire-and-forget / tolerant.** Persistence goes through `writeEventLog`,
 *   which is already fire-and-forget; we never add throwing code on that path.
 *   The only hard failure is malformed input, which Elysia's `t.Object` rejects
 *   with `400 / VALIDATION` before the handler runs.
 * - **Server-trusted actor identity.** Client-supplied `userId`/`role` are
 *   advisory; the JWT (`user`) is the source of truth.
 * - **Anti-spam.** A per-actor sliding-window limiter soft-drops floods
 *   (returns `{ accepted: false }`, HTTP 200) so a crash-looping client can't
 *   swamp the log store / dashboard.
 *
 * Final path: `POST /api/error-reports` (mounted under the root `/api` group).
 */

import { Elysia, t } from "elysia";
import type {
  ClientErrorReport,
  ClientErrorReportResponse,
} from "@azhura/shared";
import { authPlugin, type JwtPayload } from "../middleware/requireAuth";
import { writeEventLog, type LogFields } from "../lib/log-files";
import { createErrorReportRateLimiter } from "../lib/error-report-rate-limiter";

/** Hard cap on the summary line; longer messages are truncated before storage. */
const MAX_MESSAGE_LENGTH = 1000;
/** Hard cap on the stack trace kept in structured fields. */
const MAX_STACK_LENGTH = 4000;
/** Hard cap on a manual report's free-text description. */
const MAX_DESCRIPTION_LENGTH = 2000;

/** Anti-spam budget: at most N reports per actor per rolling minute. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_IN_WINDOW = 20;

const rateLimiter = createErrorReportRateLimiter({
  windowMs: RATE_WINDOW_MS,
  maxInWindow: RATE_MAX_IN_WINDOW,
});

/** Truncates a string to `max` chars (returns undefined for empty/missing). */
const truncate = (value: string | undefined, max: number): string | undefined => {
  if (!value) return undefined;
  return value.length > max ? value.slice(0, max) : value;
};

/**
 * The validated request body. Mirrors {@link ClientErrorReport} minus the
 * server-owned `userId`/`role` (those are taken from the JWT, never the body).
 */
type ErrorReportBody = Omit<ClientErrorReport, "userId" | "role">;

/**
 * Builds the `event`-stream entry for a client report: chooses the eventType by
 * kind, truncates user-supplied text, and pins actor identity to the JWT. Pure
 * and side-effect-free so it can be unit-tested without a live DB.
 */
export const buildErrorLogEntry = (
  report: ErrorReportBody,
  user: Pick<JwtPayload, "userId" | "role">
): {
  eventType: "bug_report" | "client_error";
  message: string;
  fields: LogFields;
  actor: { id: string; role: string };
} => {
  const eventType = report.kind === "manual" ? "bug_report" : "client_error";

  const fields: LogFields = {
    kind: report.kind,
    stack: truncate(report.stack, MAX_STACK_LENGTH),
    route: report.route,
    component: report.component,
    appVersion: report.appVersion,
    description: truncate(report.description, MAX_DESCRIPTION_LENGTH),
    clientTimestamp: report.timestamp,
  };

  return {
    eventType,
    message: truncate(report.message, MAX_MESSAGE_LENGTH) ?? "",
    fields,
    actor: { id: user.userId, role: user.role },
  };
};

export const errorReportRoutes = new Elysia()
  .use(authPlugin)

  /**
   * POST /api/error-reports
   * Accepts one client error/bug report from any authenticated user. Soft-drops
   * floods (`{ accepted: false }`) and otherwise records the report and returns
   * `{ accepted: true }`. Never throws from the persistence path.
   */
  .post(
    "/error-reports",
    ({ user, body }): ClientErrorReportResponse => {
      const actor = user as JwtPayload;

      // Anti-spam: soft-drop beyond the per-actor window (do not throw).
      if (!rateLimiter.check(actor.userId, Date.now()).allowed) {
        return { accepted: false };
      }

      const entry = buildErrorLogEntry(body as ErrorReportBody, actor);
      writeEventLog(entry.eventType, entry.message, entry.fields, entry.actor);

      return { accepted: true };
    },
    {
      body: t.Object({
        kind: t.Union([t.Literal("auto"), t.Literal("manual")]),
        message: t.String({ minLength: 1, maxLength: MAX_MESSAGE_LENGTH }),
        stack: t.Optional(t.String({ maxLength: MAX_STACK_LENGTH })),
        route: t.Optional(t.String({ maxLength: 300 })),
        component: t.Optional(t.String({ maxLength: 200 })),
        appVersion: t.Optional(t.String({ maxLength: 50 })),
        description: t.Optional(t.String({ maxLength: MAX_DESCRIPTION_LENGTH })),
        timestamp: t.Number(),
      }),
    }
  );
