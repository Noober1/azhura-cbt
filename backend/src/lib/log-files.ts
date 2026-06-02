/**
 * Azhura CBT Backend - File Log Sinks (winston)
 *
 * Persists server diagnostics to rotating `.log` files alongside the existing
 * console output in {@link ./logger}. Logs are split into three files so each
 * concern can be tailed/shipped independently:
 *
 * - `logs/errors.log`  — only `error`-level events (failures worth paging on).
 * - `logs/warn.log`    — only `warn`-level events (degraded-but-handled cases).
 * - `logs/access.log`  — one structured line per HTTP request (access trail).
 *
 * winston levels are hierarchical (an `error` transport would also capture
 * `warn`), so each transport uses a `format` filter to keep its file scoped to a
 * single level. Files are JSON-per-line for easy machine parsing/ingestion.
 *
 * The log directory is `backend/logs/` by default and is created on startup;
 * override with `LOG_DIR`. The whole `logs/` tree is git-ignored.
 */

import { mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import winston from "winston";

const { combine, timestamp, json } = winston.format;

/** Resolves the directory where `.log` files are written. */
const resolveLogDir = (): string => {
  const configured = process.env.LOG_DIR?.trim();
  if (configured) {
    return isAbsolute(configured) ? configured : join(process.cwd(), configured);
  }
  return join(process.cwd(), "logs");
};

const LOG_DIR = resolveLogDir();

// Ensure the target directory exists before any transport opens a stream.
// `recursive: true` makes this idempotent and safe on every boot.
mkdirSync(LOG_DIR, { recursive: true });

/** Keeps a transport scoped to exactly one level (winston is otherwise "this level and above"). */
const onlyLevel = (level: string) =>
  winston.format((info) => (info.level === level ? info : false))();

/** Shared rotation/size guard so a runaway logger can't fill the disk. */
const FILE_LIMITS = { maxsize: 5_242_880, maxFiles: 5, tailable: true } as const;

/**
 * App logger: writes `error` events to `errors.log` and `warn` events to
 * `warn.log`. Console output stays in {@link ./logger}; this sink only adds
 * durable files, so it never throws into the request path on a write error.
 */
const appFileLogger = winston.createLogger({
  level: "warn",
  format: combine(timestamp(), json()),
  transports: [
    new winston.transports.File({
      filename: join(LOG_DIR, "errors.log"),
      level: "error",
      format: onlyLevel("error"),
      ...FILE_LIMITS,
    }),
    new winston.transports.File({
      filename: join(LOG_DIR, "warn.log"),
      level: "warn",
      format: onlyLevel("warn"),
      ...FILE_LIMITS,
    }),
  ],
});

/** Dedicated access logger: one structured line per request in `access.log`. */
const accessFileLogger = winston.createLogger({
  level: "info",
  format: combine(timestamp(), json()),
  transports: [
    new winston.transports.File({
      filename: join(LOG_DIR, "access.log"),
      ...FILE_LIMITS,
    }),
  ],
});

/** Structured fields attached to a file log entry. */
export type LogFields = Record<string, unknown>;

/** Which `.log` stream an entry belongs to. */
export type LogStream = "error" | "warn" | "access";

/** A single log entry as broadcast to the supervisor dashboard. */
export interface LogBroadcast {
  stream: LogStream;
  message: string;
  fields?: LogFields;
  timestamp: string;
}

/**
 * Live broadcaster (registered by the socket layer) plus a bounded in-memory
 * ring buffer so a dashboard connecting late can backfill recent history. Both
 * are decoupled from the socket module to avoid a circular import
 * (`socket → logger → log-files`).
 */
type Broadcaster = (entry: LogBroadcast) => void;
let broadcaster: Broadcaster | null = null;

const RECENT_LIMIT = 200;
const recentEntries: LogBroadcast[] = [];

/** Registers the function used to push log entries to the supervisor dashboard. */
export const setLogBroadcaster = (fn: Broadcaster): void => {
  broadcaster = fn;
};

/**
 * Returns recent log entries (newest last), optionally filtered by stream.
 * Backs the supervisor dashboard's history/backfill endpoint.
 */
export const getRecentLogs = (stream?: LogStream): LogBroadcast[] =>
  stream ? recentEntries.filter((e) => e.stream === stream) : [...recentEntries];

/** Records an entry into the ring buffer and pushes it to the dashboard. */
const record = (stream: LogStream, message: string, fields?: LogFields): void => {
  const entry: LogBroadcast = {
    stream,
    message,
    fields,
    timestamp: new Date().toISOString(),
  };
  recentEntries.push(entry);
  if (recentEntries.length > RECENT_LIMIT) recentEntries.shift();
  // Never let a dashboard-push failure break logging or the request path.
  try {
    broadcaster?.(entry);
  } catch {
    // Intentionally swallowed: the file sinks above remain the source of truth.
  }
};

/** Appends a `warn`-level entry to `warn.log` and pushes it to the dashboard. */
export const writeWarnLog = (message: string, fields?: LogFields): void => {
  appFileLogger.warn(message, fields);
  record("warn", message, fields);
};

/** Appends an `error`-level entry to `errors.log` and pushes it to the dashboard. */
export const writeErrorLog = (message: string, fields?: LogFields): void => {
  appFileLogger.error(message, fields);
  record("error", message, fields);
};

/** Fields describing a completed HTTP request for the access trail. */
export interface AccessLogEntry {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ip?: string;
  userAgent?: string;
}

/** Appends one request line to `access.log` and pushes it to the dashboard. */
export const writeAccessLog = (entry: AccessLogEntry): void => {
  accessFileLogger.info("request", entry);
  record("access", `${entry.method} ${entry.path} ${entry.status}`, { ...entry });
};

/** Absolute directory holding the `.log` files (exposed for diagnostics). */
export const logDirectory = LOG_DIR;
