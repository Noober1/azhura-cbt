/**
 * Azhura CBT Backend - Exam Access Token Check (#1)
 *
 * Pure validation for the optional per-exam access token that gates session
 * creation. An exam with a `null` token is open; otherwise the student must
 * supply a token that matches case-insensitively (#47) and is alphanumeric,
 * at most 5 characters (mirrors the `exams.token varchar(5)` column).
 *
 * Kept pure (no I/O, no throwing) so it is trivially unit-tested; the route
 * maps each outcome to the appropriate HTTP error.
 */

/** Allowed token shape: 1–5 alphanumeric characters. */
const TOKEN_PATTERN = /^[A-Za-z0-9]{1,5}$/;

/**
 * Outcome of checking a supplied token against an exam's required token.
 * - `ok`             — access granted (exam open, or token matches).
 * - `missing`        — exam requires a token but none was supplied.
 * - `invalid_format` — supplied token isn't 1–5 alphanumeric characters.
 * - `mismatch`       — well-formed token that does not match (case-insensitive).
 */
export type TokenCheck = "ok" | "missing" | "invalid_format" | "mismatch";

/**
 * Checks a student-supplied token against the exam's required token.
 *
 * @param examToken The exam's required token, or `null` when the exam is open.
 * @param provided  The token the student supplied (may be undefined/empty).
 */
export const checkExamToken = (
  examToken: string | null,
  provided?: string
): TokenCheck => {
  // Open exam: no token required, ignore anything supplied.
  if (examToken === null) return "ok";

  if (!provided) return "missing";
  if (!TOKEN_PATTERN.test(provided)) return "invalid_format";

  // Case-insensitive comparison (#47): "Ab12c" matches "ab12c". Admin tokens are
  // stored upper-cased, but compare both sides defensively for legacy rows.
  return provided.toUpperCase() === examToken.toUpperCase() ? "ok" : "mismatch";
};
