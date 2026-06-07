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
