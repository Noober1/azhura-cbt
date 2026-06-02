/**
 * Azhura CBT Backend - Structured Logger
 *
 * A single, scoped logging entrypoint so every server-side diagnostic shares a
 * consistent, greppable shape: `<ISO time> <LEVEL> [scope] message { context }`.
 *
 * Centralizing logging here means request/DB/socket failures all carry the same
 * structured context, which makes production tracing far easier than scattered
 * `console.log` calls.
 *
 * Verbosity is controlled by `LOG_LEVEL` (debug|info|warn|error). It defaults to
 * `debug` outside production and `info` in production.
 */

import { writeErrorLog, writeWarnLog } from "./log-files";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const resolveMinLevel = (): LogLevel => {
  const fromEnv = process.env.LOG_LEVEL?.toLowerCase();
  if (fromEnv && fromEnv in LEVEL_PRIORITY) return fromEnv as LogLevel;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
};

const MIN_LEVEL = resolveMinLevel();

/** Structured, JSON-serializable context attached to a log line. */
export type LogContext = Record<string, unknown>;

/** A namespaced logger returned by {@link createLogger}. */
export interface Logger {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  /**
   * Logs an error with its scope, a human-readable message, the original cause
   * (preserving name/message/stack), and any extra context.
   */
  error: (message: string, error?: unknown, context?: LogContext) => void;
}

const shouldLog = (level: LogLevel): boolean =>
  LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];

/** Serializes an unknown thrown value into a loggable plain object. */
const serializeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: String(error) };
};

/**
 * Creates a logger bound to a specific scope (subsystem name).
 *
 * @param scope Short subsystem identifier, e.g. "Server", "Auth", "DB".
 * @returns A {@link Logger} whose output is prefixed with `[scope]`.
 */
export const createLogger = (scope: string): Logger => {
  const prefix = `[${scope}]`;

  const line = (level: LogLevel, message: string): string =>
    `${new Date().toISOString()} ${level.toUpperCase()} ${prefix} ${message}`;

  const emit = (
    level: Exclude<LogLevel, "error">,
    message: string,
    context?: LogContext
  ): void => {
    if (!shouldLog(level)) return;
    const sink = level === "warn" ? console.warn : console.log;
    if (context) sink(line(level, message), context);
    else sink(line(level, message));
    // Persist warnings to warn.log (console output above is unchanged).
    if (level === "warn") writeWarnLog(`${prefix} ${message}`, context);
  };

  return {
    debug: (message, context) => emit("debug", message, context),
    info: (message, context) => emit("info", message, context),
    warn: (message, context) => emit("warn", message, context),
    error: (message, error, context) => {
      if (!shouldLog("error")) return;
      const payload: LogContext = { ...context };
      if (error !== undefined) payload.error = serializeError(error);
      console.error(line("error", message), payload);
      // Persist errors to errors.log (console output above is unchanged).
      writeErrorLog(`${prefix} ${message}`, payload);
    },
  };
};
