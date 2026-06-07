/**
 * Azhura CBT Backend - Log Field Redaction (#18)
 *
 * Strips secrets from structured log context before it is persisted, broadcast
 * to the admin viewer, or written to disk. Logs must never leak passwords,
 * tokens, or answer keys (issue #18 acceptance criteria).
 *
 * Matching is by key name, case-insensitive, and works at any depth (nested
 * objects and arrays). A matched value is replaced with the marker `"[redacted]"`
 * rather than dropped, so the shape of the log stays intact and the redaction is
 * visible to whoever reads it.
 *
 * Kept pure (no I/O) so it is trivially unit-tested.
 */

/** Marker substituted for any redacted value. */
export const REDACTED = "[redacted]";

/**
 * Key substrings that mark a sensitive field. A key matches when it *contains*
 * one of these (case-insensitive), so `password`, `passwordHash`, and
 * `newPassword` are all caught. Keep this list conservative but complete.
 */
const SENSITIVE_KEY_PATTERNS = [
  "password",
  "passphrase",
  "token", // exam access token, JWT, refresh token, …
  "secret",
  "authorization",
  "cookie",
  "correctoption", // exam answer key (correctOptionId)
  "correctanswer",
  "answerkey",
] as const;

/** Returns true when a key name looks sensitive. */
const isSensitiveKey = (key: string): boolean => {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => lower.includes(p));
};

/** Recursively redacts a single value (object/array/primitive). */
const redactValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === "object") {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
};

/** Redacts an object's sensitive keys, recursing into the rest. */
const redactObject = (
  obj: Record<string, unknown>
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactValue(value);
  }
  return out;
};

/**
 * Returns a deep copy of `fields` with every sensitive value replaced by
 * {@link REDACTED}. Returns `null` for nullish input so callers can store a
 * clean `null` when there is no context.
 *
 * @param fields Arbitrary structured log context (may be undefined/null).
 */
export const redactFields = (
  fields?: Record<string, unknown> | null
): Record<string, unknown> | null => {
  if (!fields) return null;
  return redactObject(fields);
};
