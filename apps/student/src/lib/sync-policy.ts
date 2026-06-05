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
 * Maps an HTTP status (from a failed flush) to a {@link FlushOutcome}.
 *
 * - `409 Conflict` — session already submitted (backend `ConflictError`).
 * - `410 Gone`     — exam time expired (backend `GoneError`).
 *
 * Both mean the server will never accept these answers again, so they are
 * dropped. Any other status — including `undefined` (offline / no response) —
 * is retried.
 *
 * @param status HTTP status code, or `undefined` when no response was received.
 */
export const classifyFlushFailure = (status: number | undefined): FlushOutcome =>
  status === 409 || status === 410 ? "drop" : "retry";
