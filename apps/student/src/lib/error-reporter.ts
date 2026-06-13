/**
 * Azhura CBT App - Client Error / Bug Reporter (#168 epic — #170 + #171)
 *
 * A single, fire-and-forget channel for shipping client-side problems to the
 * backend's `POST /error-reports` ingest (#169). Two entry points share one
 * core:
 *
 * - {@link reportError} — automatic capture (ErrorBoundary #171 + global
 *   `window.onerror` / `unhandledrejection` handlers). Debounced + deduped so a
 *   render loop or a repeating rejection collapses into a single POST instead of
 *   flooding the endpoint. Never throws; swallows POST failures.
 * - {@link reportBug} — user-initiated "Lapor bug" form (#170). Surfaces the
 *   server's accept/reject result to the caller so the dialog can toast.
 *
 * The server pins actor identity from the JWT and ignores any client-supplied
 * `userId`/`role`, so we never send them. The endpoint is rate-limited and
 * fire-and-forget server-side; on the client every failure is non-fatal.
 */

import type { ClientErrorReport } from "@azhura/shared";
import api from "./api";
import { getErrorMessage, toErrorContext } from "./errors";
import { createLogger } from "./logger";

const log = createLogger("ErrorReporter");

/** Trailing window in which identical auto-reports collapse into one POST. */
const DEDUP_WINDOW_MS = 5000;

/** Server-side caps mirrored client-side so we never ship oversized fields. */
const MESSAGE_MAX = 1000;
const STACK_MAX = 4000;
const DESCRIPTION_MAX = 2000;

/** Body sent to the ingest: the shared shape minus server-pinned actor fields. */
type ReportBody = Omit<ClientErrorReport, "userId" | "role">;

/** Last auto-captured context, attached to manual reports on request. */
interface LastError {
  message: string;
  stack?: string;
  component?: string;
  route?: string;
}

let lastError: LastError | null = null;

/** Pending dedup timers keyed by report signature. */
const pendingSignatures = new Map<string, ReturnType<typeof setTimeout>>();

/** Truncates a string to `max` chars, returning `undefined` for empty input. */
const cap = (value: string | undefined, max: number): string | undefined => {
  if (!value) return undefined;
  return value.length > max ? value.slice(0, max) : value;
};

/** Current app route from the hash router (e.g. `/exam`), `undefined` on SSR. */
const currentRoute = (): string | undefined => {
  if (typeof window === "undefined") return undefined;
  const hash = window.location.hash.replace(/^#/, "");
  return hash || "/";
};

/** Client app version, sourced from the build-time env with a safe fallback. */
const appVersion = (): string =>
  (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "student-dev";

/** Stable signature so identical auto-errors dedup within the window. */
const signatureOf = (body: ReportBody): string =>
  `${body.message}|${body.component ?? ""}|${body.route ?? ""}`;

/** POSTs a report, swallowing every failure (auto path is non-fatal). */
const sendQuietly = async (body: ReportBody): Promise<void> => {
  try {
    await api.post("/error-reports", body);
  } catch (error: unknown) {
    log.warn("Failed to ship error report", toErrorContext(error));
  }
};

/**
 * Reports an automatically-captured error. Builds a `kind:"auto"` report,
 * remembers it as the "last error" (for {@link reportBug}), and debounces the
 * POST by signature so repeated identical errors collapse to one request.
 * Never throws.
 */
export const reportError = (input: {
  error?: unknown;
  message?: string;
  component?: string;
  stack?: string;
}): void => {
  const message =
    cap(input.message ?? getErrorMessage(input.error), MESSAGE_MAX) ??
    "Kesalahan tidak diketahui";
  const stack =
    cap(
      input.stack ?? (input.error instanceof Error ? input.error.stack : undefined),
      STACK_MAX
    );
  const route = currentRoute();

  lastError = { message, stack, component: input.component, route };

  const body: ReportBody = {
    kind: "auto",
    message,
    stack,
    route,
    component: input.component,
    appVersion: appVersion(),
    timestamp: Date.now(),
  };

  const signature = signatureOf(body);
  const existing = pendingSignatures.get(signature);
  if (existing !== undefined) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingSignatures.delete(signature);
    void sendQuietly(body);
  }, DEDUP_WINDOW_MS);
  pendingSignatures.set(signature, timer);
};

/**
 * Submits a user-written bug report (#170). The first line of `description`
 * becomes the summary `message`; the full text rides along as `description`.
 * When `includeLastError` is set, the most recent auto-captured error context
 * is attached so the report carries the crash the user just hit.
 *
 * Unlike {@link reportError}, this surfaces transport failures to the caller
 * (the dialog) so it can toast success/failure — it is user-initiated.
 *
 * @returns Whether the server accepted the report.
 */
export const reportBug = async (
  description: string,
  opts?: { includeLastError?: boolean }
): Promise<boolean> => {
  const trimmed = description.trim();
  const firstLine = trimmed.split("\n", 1)[0]?.trim();
  const message = cap(firstLine || "Laporan bug", MESSAGE_MAX) ?? "Laporan bug";

  const attach = opts?.includeLastError ? lastError : null;

  const body: ReportBody = {
    kind: "manual",
    message,
    description: cap(trimmed, DESCRIPTION_MAX),
    stack: attach?.stack,
    component: attach?.component,
    route: attach?.route ?? currentRoute(),
    appVersion: appVersion(),
    timestamp: Date.now(),
  };

  const res = await api.post<{ accepted: boolean }>("/error-reports", body);
  return res.data?.accepted === true;
};

/** Clears the cached "last error" (mainly for tests). */
export const __resetLastError = (): void => {
  lastError = null;
};

/** Cancels and forgets all pending dedup timers (mainly for tests). */
export const __resetPendingSignatures = (): void => {
  for (const timer of pendingSignatures.values()) clearTimeout(timer);
  pendingSignatures.clear();
};

/**
 * Sentinel kept on `window` (not a module-level flag) so installation survives
 * a Vite HMR module re-evaluation: a hot-replaced module would reset a local
 * flag and double-register listeners, producing duplicate auto-reports in dev.
 */
const INSTALLED_FLAG = "__azhuraErrorHandlersInstalled";
type FlaggedWindow = Window & { [INSTALLED_FLAG]?: boolean };

/**
 * Installs global `error` + `unhandledrejection` listeners that route into
 * {@link reportError}. Idempotent across HMR re-evals — repeated calls are
 * no-ops — and returns a cleanup fn that removes the listeners. Safe to call
 * during bootstrap.
 */
export const installGlobalErrorHandlers = (): (() => void) => {
  if (typeof window === "undefined") return () => {};
  const flagged = window as FlaggedWindow;
  if (flagged[INSTALLED_FLAG]) return () => {};
  flagged[INSTALLED_FLAG] = true;

  const onError = (event: ErrorEvent): void => {
    reportError({
      error: event.error,
      message: event.message,
      component: "window.onerror",
    });
  };

  const onRejection = (event: PromiseRejectionEvent): void => {
    reportError({
      error: event.reason,
      component: "unhandledrejection",
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    delete flagged[INSTALLED_FLAG];
  };
};
