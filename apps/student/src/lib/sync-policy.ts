/**
 * Azhura CBT App - Answer Sync Failure Policy (#10 autosave)
 *
 * Decides what to do with queued answers when a server flush fails. Some
 * failures are terminal for the *session* (the exam was submitted or its time
 * expired) — retrying those forever would pin the queue open and spam the
 * server. Everything else (offline, 5xx, transient network) is retryable.
 *
 * Pure mapping so the keep/drop decision is unit-testable without a live
 * network or store.
 */

/** What the connectivity store should do with the queued batch on failure. */
export type FlushOutcome = "drop" | "retry";

/**
 * Statuses that mean the server will never accept this batch, so the queue is
 * dropped rather than retried forever:
 * - `400 Bad Request`  — malformed batch; the same payload will keep failing.
 * - `401 Unauthorized` / `403 Forbidden` — the session/token is gone (a 401 also
 *   logs the student out via the api interceptor); retrying is pointless.
 * - `404 Not Found`    — the session no longer exists.
 * - `409 Conflict`     — session already submitted (backend `ConflictError`).
 * - `410 Gone`         — exam time expired (backend `GoneError`).
 */
const TERMINAL_FLUSH_STATUSES = new Set([400, 401, 403, 404, 409, 410]);

/**
 * Maps an HTTP status (from a failed flush) to a {@link FlushOutcome}. Terminal
 * client errors (see {@link TERMINAL_FLUSH_STATUSES}) drop the queue; any other
 * status — including `undefined` (offline / no response) or 5xx — is retried.
 *
 * @param status HTTP status code, or `undefined` when no response was received.
 */
export const classifyFlushFailure = (status: number | undefined): FlushOutcome =>
  status !== undefined && TERMINAL_FLUSH_STATUSES.has(status) ? "drop" : "retry";
