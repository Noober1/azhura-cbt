/**
 * Azhura CBT Backend - Admin guard
 *
 * Reusable `onBeforeHandle` guard restricting a route group to the `admin`
 * role only (data management — exams, questions, students, groups). Supervisors
 * are intentionally excluded: their realtime proctoring actions live under
 * `/supervisor`. Pair with {@link authPlugin}, which populates `user`.
 */

import { ForbiddenError } from "../lib/errors";
import type { JwtPayload } from "./requireAuth";

/** Throws {@link ForbiddenError} (→ 403) unless the caller is an admin. */
export function requireAdmin({ user }: { user: JwtPayload }): void {
  if (user.role !== "admin") {
    throw new ForbiddenError("Akses ditolak. Khusus admin.");
  }
}
