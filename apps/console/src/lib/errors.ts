/**
 * Azhura CBT Console — error helpers
 *
 * Normalizes axios/unknown errors into a user-facing Indonesian message,
 * preferring the backend's structured `{ message }` body when present.
 */

import axios from "axios";

/**
 * Extracts a human-readable message from any thrown value.
 * Priority: backend `{ message }` → axios message → fallback.
 */
export function getErrorMessage(error: unknown, fallback = "Terjadi kesalahan."): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

/** @returns the HTTP status of an axios error, or `undefined`. */
export function getStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}
