/**
 * Azhura CBT Backend - Persistent Log Store (#18)
 *
 * DB-backed persistence for application logs so the admin viewer can query,
 * filter, and paginate history that survives restarts — complementing the
 * in-memory ring buffer (fast late-join backfill) and the `.log` files.
 *
 * Decoupled from the structured logger to avoid an import cycle
 * (`logger → log-files → log-store`); on failure it swallows the error rather
 * than logging (the file sinks remain the source of truth), so a DB hiccup can
 * never break the request path or recurse into the logger.
 */

import { and, desc, eq, gte, lte, lt, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type {
  LogBroadcast,
  LogEntry,
  LogPage,
  LogQuery,
  LogStream,
} from "@azhura/shared";

// NB: access `schema.appLogs` lazily inside functions rather than destructuring
// it at module top. This module is pulled in while `../db` is still evaluating
// (db → logger → log-files → log-store), so a top-level `schema.appLogs` read
// would hit the table binding in its temporal dead zone.

/** Hard cap on page size so a hostile/buggy caller can't ask for everything. */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/** Default retention window: entries older than this are pruned (#18). */
export const LOG_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Persists one log entry. Fire-and-forget: never awaited on the request path and
 * never throws — a failed insert is silently dropped so logging can't cascade.
 */
export const insertLog = (entry: LogBroadcast): void => {
  void db
    .insert(schema.appLogs)
    .values({
      stream: entry.stream,
      eventType: entry.eventType,
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      message: entry.message.slice(0, 512),
      fields: entry.fields ?? null,
      createdAt: entry.timestamp,
    })
    .catch(() => {
      // Intentionally swallowed — file sinks remain authoritative.
    });
};

/** Maps a DB row onto the shared {@link LogEntry} contract. */
const toEntry = (row: typeof schema.appLogs.$inferSelect): LogEntry => ({
  id: row.id,
  stream: row.stream as LogStream,
  eventType: row.eventType,
  actorId: row.actorId,
  actorRole: row.actorRole,
  message: row.message,
  fields: (row.fields as Record<string, unknown> | null) ?? null,
  timestamp: row.createdAt,
});

/**
 * Returns a filtered, paginated page of logs (newest first). Backs
 * `GET /admin/logs`. Page/limit are clamped to safe bounds.
 */
export const queryLogs = async (query: LogQuery): Promise<LogPage> => {
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(query.limit ?? DEFAULT_LIMIT)));
  const offset = (page - 1) * limit;

  const conditions = [
    query.stream ? eq(schema.appLogs.stream, query.stream) : undefined,
    query.eventType ? eq(schema.appLogs.eventType, query.eventType) : undefined,
    query.actorId ? eq(schema.appLogs.actorId, query.actorId) : undefined,
    query.from !== undefined ? gte(schema.appLogs.createdAt, query.from) : undefined,
    query.to !== undefined ? lte(schema.appLogs.createdAt, query.to) : undefined,
  ].filter((c): c is Exclude<typeof c, undefined> => c !== undefined);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(schema.appLogs)
      .where(where)
      .orderBy(desc(schema.appLogs.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)` })
      .from(schema.appLogs)
      .where(where),
  ]);

  return { rows: rows.map(toEntry), total: Number(total), page, limit };
};

/**
 * Deletes entries older than the retention window. Called once at startup so an
 * on-premise deployment self-trims without an external cron.
 *
 * @param days Retention window in days (default {@link LOG_RETENTION_DAYS}).
 * @returns the number of rows deleted (0 on error — never throws).
 */
export const pruneOldLogs = async (
  days: number = LOG_RETENTION_DAYS
): Promise<number> => {
  const cutoff = Date.now() - days * DAY_MS;
  try {
    const result = await db.delete(schema.appLogs).where(lt(schema.appLogs.createdAt, cutoff));
    // mysql2 returns an array whose first element carries affectedRows.
    const affected = (result as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
    return affected ?? 0;
  } catch {
    return 0;
  }
};
