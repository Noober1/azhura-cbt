/**
 * Azhura CBT Backend — Admin Recap Route Auth-Gating Tests (#19)
 *
 * Smoke tests that mount the real route plugin via `app.handle()` but never hit
 * the DB: auth/role failures short-circuit in the middleware before any query.
 * - No / malformed token → 401 (authPlugin).
 * - Valid non-admin (supervisor) token → 403 (requireAdmin).
 *
 * The scoring/statistics logic is unit-tested separately in `lib/recap.test.ts`.
 */

import { describe, it, expect } from "bun:test";
import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { getJwtSecret } from "../../lib/env";
import { adminRecapRoutes } from "./recap";

const app = new Elysia().group("/api", (a) => a.use(adminRecapRoutes));

/** Mints a JWT identical to what `authPlugin` verifies (same secret/HS256). */
const tokenSigner = new Elysia()
  .use(jwt({ name: "jwt", secret: getJwtSecret() }))
  .get("/__sign", ({ jwt, query }) =>
    jwt.sign({
      userId: "u-test",
      nis: "00000",
      role: query.role ?? "supervisor",
      groupId: "",
    })
  );

async function signToken(role: string): Promise<string> {
  const res = await tokenSigner.handle(
    new Request(`http://localhost/__sign?role=${role}`)
  );
  return res.text();
}

const examUrl = "http://localhost/api/admin/recap/exams/exam-1";
const studentUrl = "http://localhost/api/admin/recap/students/user-1";

describe("GET /api/admin/recap/exams/:examId — auth gating", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const res = await app.handle(new Request(examUrl));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the token is malformed", async () => {
    const res = await app.handle(
      new Request(examUrl, { headers: { authorization: "Bearer not-a-real-token" } })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a valid supervisor (non-admin) token", async () => {
    const token = await signToken("supervisor");
    const res = await app.handle(
      new Request(examUrl, { headers: { authorization: `Bearer ${token}` } })
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/admin/recap/students/:studentId — auth gating", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const res = await app.handle(new Request(studentUrl));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a valid supervisor (non-admin) token", async () => {
    const token = await signToken("supervisor");
    const res = await app.handle(
      new Request(studentUrl, { headers: { authorization: `Bearer ${token}` } })
    );
    expect(res.status).toBe(403);
  });
});
