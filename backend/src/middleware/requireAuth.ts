/**
 * Azhura CBT Backend - Authentication Middleware (Elysia plugin)
 *
 * A scoped Elysia plugin that verifies the `Authorization: Bearer <jwt>` header
 * and exposes the decoded payload as `user` on the request context. On failure
 * it throws an {@link AuthError}, which the central error handler maps to `401`
 * (no manual status juggling, no string-matching).
 */

import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { getJwtSecret } from "../lib/env";
import { AuthError } from "../lib/errors";

/** Decoded JWT payload carried on authenticated requests. */
export interface JwtPayload {
  userId: string;
  nis: string;
  role: string;
  /** The student's group; "" for supervisors/admins (no group). */
  groupId: string;
}

export const authPlugin = new Elysia({ name: "auth-plugin" })
  .use(
    jwt({
      name: "jwt",
      secret: getJwtSecret(),
      exp: "8h",
    })
  )
  .derive({ as: "scoped" }, async ({ jwt, headers }) => {
    const authHeader = headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthError("Token tidak ditemukan.");
    }

    const token = authHeader.slice(7);
    const payload = await jwt.verify(token);

    if (!payload) {
      throw new AuthError("Token tidak valid atau kedaluwarsa.");
    }

    return { user: payload as unknown as JwtPayload };
  });
