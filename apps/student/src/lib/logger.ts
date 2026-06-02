/**
 * Azhura CBT App - Centralized Structured Logger
 *
 * A single, scoped logging entrypoint so that every diagnostic message in the
 * app shares a consistent, greppable shape: `[scope] message { ...context }`.
 *
 * Why this exists:
 * - Tracing a failure across stores/lib is far easier when every log line is
 *   namespaced and carries structured context instead of ad-hoc `console.*`.
 * - Log volume can be tuned in one place (e.g. silenced in production builds)
 *   instead of hunting down scattered `console.log` statements.
 *
 * Usage:
 * ```ts
 * const log = createLogger("Exam");
 * log.info("Session restored", { examSessionId });
 * log.error("Failed to submit", err, { examId });
 * ```
 */

/** Severity levels in ascending order of importance. */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Minimum level that will actually be emitted.
 * In production builds we drop `debug`/`info` noise but always keep
 * `warn`/`error` so real problems remain traceable in the field.
 */
const MIN_LEVEL: LogLevel =
  typeof import.meta !== "undefined" && import.meta.env?.DEV ? "debug" : "warn";

/** Structured, JSON-serializable context attached to a log line. */
export type LogContext = Record<string, unknown>;

/** A namespaced logger returned by {@link createLogger}. */
export interface Logger {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  /**
   * Logs an error with its scope, a human-readable message, the original
   * cause (preserving the stack trace), and any extra context.
   */
  error: (message: string, error?: unknown, context?: LogContext) => void;
}

const shouldLog = (level: LogLevel): boolean =>
  LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];

/**
 * Creates a logger bound to a specific scope (subsystem name).
 *
 * @param scope Short subsystem identifier, e.g. "Auth", "Storage", "Socket".
 * @returns A {@link Logger} whose output is prefixed with `[scope]`.
 */
export const createLogger = (scope: string): Logger => {
  const prefix = `[${scope}]`;

  const emit = (
    level: Exclude<LogLevel, "error">,
    message: string,
    context?: LogContext
  ): void => {
    if (!shouldLog(level)) return;
    // eslint-disable-next-line no-console
    const sink = level === "warn" ? console.warn : console.log;
    if (context) {
      sink(`${prefix} ${message}`, context);
    } else {
      sink(`${prefix} ${message}`);
    }
  };

  return {
    debug: (message, context) => emit("debug", message, context),
    info: (message, context) => emit("info", message, context),
    warn: (message, context) => emit("warn", message, context),
    error: (message, error, context) => {
      if (!shouldLog("error")) return;
      const payload: LogContext = { ...context };
      if (error !== undefined) {
        payload.cause = error;
        if (error instanceof Error && error.stack) {
          payload.stack = error.stack;
        }
      }
      // eslint-disable-next-line no-console
      console.error(`${prefix} ${message}`, payload);
    },
  };
};
