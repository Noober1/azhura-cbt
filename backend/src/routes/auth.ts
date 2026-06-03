/**
 * Azhura CBT Backend - Authentication Routes (Drizzle)
 *
 * Endpoints:
 * - `POST /api/auth/login`    — verifies NIS + password (bcrypt) and issues a JWT.
 * - `GET  /api/auth/validate` — checks whether a bearer token is still valid.
 *
 * Both intentionally return identical "NIS atau password salah." messages for
 * unknown-user vs wrong-password to avoid leaking which NIS exist.
 */

import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { getJwtSecret } from "../lib/env";
import { AuthError } from "../lib/errors";
import { createLogger } from "../lib/logger";

const { users } = schema;

const log = createLogger("Auth");

export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(
    jwt({
      name: "jwt",
      secret: getJwtSecret(),
      exp: "8h",
    })
  )

  /**
   * POST /api/auth/login
   * @returns `{ token, userId, user }` on success; `401 { message }` otherwise.
   */
  .post(
    "/login",
    async ({ jwt, body, set }) => {
      const { nis, password } = body;

      const record = await db.query.users.findFirst({
        columns: {
          id: true,
          nis: true,
          name: true,
          password: true,
          role: true,
          groupId: true,
          isActive: true,
        },
        where: eq(users.nis, nis),
      });

      if (!record) {
        log.warn("Login failed: unknown NIS", { nis });
        set.status = 401;
        return { message: "NIS atau password salah." };
      }

      const valid = await bcrypt.compare(password, record.password);
      if (!valid) {
        log.warn("Login failed: wrong password", { nis, userId: record.id });
        set.status = 401;
        return { message: "NIS atau password salah." };
      }

      // Reject deactivated accounts only AFTER verifying the password, so an
      // unauthenticated probe cannot learn which NIS are active vs disabled.
      if (record.isActive !== 1) {
        log.warn("Login blocked: inactive account", { nis, userId: record.id });
        set.status = 403;
        return { message: "Akun Anda dinonaktifkan. Hubungi administrator." };
      }

      const token = await jwt.sign({
        userId: record.id,
        nis: record.nis,
        role: record.role,
        // `groupId` is null for supervisors/admins. JSON.stringify drops null
        // in the JWT lib, so coerce to "" to keep the claim present.
        groupId: record.groupId ?? "",
      });

      log.info("Login success", { userId: record.id, nis: record.nis });
      return {
        token,
        userId: record.id,
        user: {
          id: record.id,
          nis: record.nis,
          name: record.name,
        },
      };
    },
    {
      body: t.Object({
        nis: t.String({ minLength: 5 }),
        password: t.String({ minLength: 6 }),
      }),
    }
  )

  /**
   * GET /api/auth/validate
   * Validates the bearer token. Throws {@link AuthError} (→ 401) when missing or
   * invalid; returns `{ valid: true }` when the token is good.
   */
  .get("/validate", async ({ jwt, headers }) => {
    const authHeader = headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthError("Token tidak ditemukan.");
    }

    const token = authHeader.slice(7);
    const payload = await jwt.verify(token);

    if (!payload) {
      throw new AuthError("Token tidak valid atau kedaluwarsa.");
    }

    return { valid: true };
  });
