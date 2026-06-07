/**
 * Azhura CBT Backend — First-run setup helpers
 *
 * Small, DB-free predicates shared by the public setup route and its tests. The
 * "is this a fresh install?" question reduces to "does any admin account exist?"
 * — keeping that rule in one pure function makes it trivially testable and keeps
 * the route handler thin.
 */

/**
 * Whether the system still needs first-run setup, given the number of existing
 * admin accounts. A fresh database has zero admins, so the console must show the
 * setup wizard until the first admin is provisioned.
 */
export function isSetupNeeded(adminCount: number): boolean {
  return adminCount <= 0;
}

/** Minimum length of the admin NIS/username (matches the login constraint). */
export const MIN_ADMIN_NIS_LENGTH = 5;

/** Already-trimmed setup fields that carry a length/presence invariant. */
export interface TrimmedSetupInput {
  adminNis: string;
  adminName: string;
  schoolName: string;
}

/**
 * Validates the trimmed setup fields, returning a user-facing error message or
 * `null` when valid. The route schema only length-checks the RAW body, so an
 * all-whitespace value (e.g. "     ") would otherwise pass and create a broken
 * admin that still locks setup — this guards the post-trim values.
 */
export function validateTrimmedSetup({
  adminNis,
  adminName,
  schoolName,
}: TrimmedSetupInput): string | null {
  if (!schoolName) return "Nama sekolah wajib diisi.";
  if (!adminName) return "Nama admin wajib diisi.";
  if (adminNis.length < MIN_ADMIN_NIS_LENGTH) {
    return `NIS admin minimal ${MIN_ADMIN_NIS_LENGTH} karakter.`;
  }
  return null;
}
