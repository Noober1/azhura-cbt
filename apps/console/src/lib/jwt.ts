/**
 * Azhura CBT Console — JWT payload decoding (client-side, read-only)
 *
 * The console gates routes by role. The backend embeds `role` in the JWT but the
 * `/auth/login` response body intentionally does not, so we read the (unsigned,
 * non-secret) payload here purely to drive UI gating. The server still enforces
 * authorization on every admin endpoint via `requireAdmin` — this decode is a UX
 * convenience, never a security boundary.
 */

export type UserRole = "student" | "supervisor" | "admin";

export interface JwtClaims {
  userId: string;
  nis: string;
  role: UserRole;
  /** "" for supervisors/admins (no group). */
  groupId: string;
  exp?: number;
  iat?: number;
}

/** Base64url → string, tolerant of missing padding. */
function base64UrlDecode(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

/**
 * Decodes a JWT's payload without verifying its signature.
 * @returns the claims, or `null` if the token is malformed.
 */
export function decodeJwt(token: string): JwtClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = base64UrlDecode(parts[1]);
    const claims = JSON.parse(json) as JwtClaims;
    if (!claims.role) return null;
    return claims;
  } catch {
    return null;
  }
}

/** @returns `true` when the token's `exp` (seconds) is in the past. */
export function isExpired(claims: JwtClaims): boolean {
  if (!claims.exp) return false;
  return claims.exp * 1000 <= Date.now();
}
