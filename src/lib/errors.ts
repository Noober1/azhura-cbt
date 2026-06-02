/**
 * Azhura CBT App - Error Normalization Utilities
 *
 * Helpers to turn untrusted `unknown` values (caught errors, axios failures,
 * corrupted persisted data) into safe, predictable shapes. Keeping this logic
 * in one place makes error handling consistent and tracing straightforward:
 * every `catch` block can extract a reliable message and context the same way.
 */

import { isAxiosError } from "axios";
import { createLogger } from "./logger";

const log = createLogger("Storage");

/**
 * Extracts a human-readable message from any thrown value.
 *
 * Handles, in priority order: axios responses (server `message`/`error`
 * fields), native `Error` instances, plain strings, and an opaque fallback.
 *
 * @param error The caught value (typed as `unknown`).
 * @param fallback Message used when nothing more specific can be derived.
 * @returns A safe, displayable string — never throws.
 */
export const getErrorMessage = (
  error: unknown,
  fallback = "Terjadi kesalahan yang tidak terduga."
): string => {
  if (isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string; error?: string }
      | undefined;
    return data?.message || data?.error || error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
};

/**
 * Builds a structured, JSON-serializable context object describing an error,
 * suitable for passing to {@link createLogger}'s `error` method or for
 * forwarding to a remote monitoring endpoint.
 *
 * @param error The caught value (typed as `unknown`).
 * @returns An object with `message` and, when available, HTTP `status`/`url`.
 */
export const toErrorContext = (
  error: unknown
): Record<string, unknown> => {
  const context: Record<string, unknown> = {
    message: getErrorMessage(error),
  };
  if (isAxiosError(error)) {
    context.status = error.response?.status;
    context.url = error.config?.url;
    context.method = error.config?.method;
  }
  return context;
};

/**
 * Safely parses a JSON string, returning a fallback instead of throwing when
 * the input is malformed. Corrupted `localStorage` is a common, hard-to-trace
 * source of crashes during store initialization — this contains the blast
 * radius and logs exactly which key failed.
 *
 * @typeParam T Expected shape of the parsed value.
 * @param raw The raw JSON string (or `null`, e.g. from `localStorage.getItem`).
 * @param fallback Value returned when `raw` is null/empty or parsing fails.
 * @param context Short label (e.g. the storage key) for traceable logging.
 * @returns The parsed value, or `fallback` on any failure.
 */
export const safeJsonParse = <T>(
  raw: string | null,
  fallback: T,
  context: string
): T => {
  if (raw === null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    log.error(`Failed to parse persisted JSON for "${context}"`, error, {
      context,
      rawPreview: raw.slice(0, 120),
    });
    return fallback;
  }
};
