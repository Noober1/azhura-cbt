/**
 * Azhura CBT Backend — Admin Supervisor Account Route Tests (#139)
 *
 * Hybrid suite:
 * 1. Always-run auth-gating smoke tests via `app.handle()`. Auth/role failures
 *    short-circuit in the middleware before any DB call, so these need no live DB.
 *    - No / malformed token → 401 (authPlugin).
 *    - Valid non-admin (student) token → 403 (requireAdmin).
 * 2. DB-integration tests guarded by a runtime DB-readiness probe. When the DB is
 *    unreachable (credential-less CI), the whole block is skipped cleanly so the
 *    suite still passes. Fixtures use a throwaway `zzt_` NIS prefix and are purged
 *    in `afterAll`, so the suite leaves no residue and never collides with seeds.
 */

// Import the db module first to break the db↔logger import cycle: `db/index.ts`
// instantiates a logger at module load, and importing a route (which pulls in
// the logger module) before `../../db` triggers a `createLogger` TDZ error.
import "../../db";

import { describe, it, expect, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { randomUUID } from "crypto";
import { like } from "drizzle-orm";
import { getJwtSecret } from "../../lib/env";
import { db, schema, assertDbConnection } from "../../db";
import { adminSupervisorRoutes } from "./supervisors";

const { users } = schema;

const app = new Elysia().group("/api", (a) => a.use(adminSupervisorRoutes));

// ── Token minting (identical secret/HS256 to what authPlugin verifies) ───────

const tokenSigner = new Elysia()
  .use(jwt({ name: "jwt", secret: getJwtSecret() }))
  .get("/__sign", ({ jwt, query }) =>
    jwt.sign({
      userId: query.userId ?? "u-test",
      nis: "00000",
      role: query.role ?? "admin",
      groupId: "",
    })
  );

async function signToken(role: string, userId = "u-test"): Promise<string> {
  const res = await tokenSigner.handle(
    new Request(`http://localhost/__sign?role=${role}&userId=${userId}`)
  );
  return res.text();
}

const supervisorsUrl = "http://localhost/api/admin/supervisors";

// ── 1. Always-run auth-gating smoke tests ────────────────────────────────────

describe("POST /api/admin/supervisors — auth gating", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const res = await app.handle(
      new Request(supervisorsUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nis: "zzt_x", name: "X", password: "secret1" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when the token is malformed", async () => {
    const res = await app.handle(
      new Request(supervisorsUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer not-a-real-token",
        },
        body: JSON.stringify({ nis: "zzt_x", name: "X", password: "secret1" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a valid non-admin (student) token", async () => {
    const token = await signToken("student");
    const res = await app.handle(
      new Request(supervisorsUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nis: "zzt_x", name: "X", password: "secret1" }),
      })
    );
    expect(res.status).toBe(403);
  });
});

// ── 2. DB-integration tests (skipped cleanly when DB is unreachable) ─────────

const TEST_NIS_PREFIX = "zzt_";
let adminToken = "";
// A seeded STUDENT id, used to assert role enforcement returns 404 (not a supervisor).
const seededStudentId = randomUUID();
const seededAdminId = randomUUID();

/**
 * Probe DB readiness at module load (top-level await) so the value is known
 * BEFORE `it.skipIf(...)` is evaluated — Bun reads the skip condition eagerly at
 * test-collection time, so a flag set in `beforeAll` would always read `false`.
 */
async function probeDb(): Promise<boolean> {
  try {
    await assertDbConnection();
    return true;
  } catch {
    return false;
  }
}

const dbReady = await probeDb();

if (dbReady) {
  // Sign an admin token whose userId matches a real admin row (requireAdmin only
  // checks the JWT role, but seeding the row keeps the fixture self-consistent).
  adminToken = await signToken("admin", seededAdminId);

  // Clear any leftovers from a previously aborted run before seeding.
  await db.delete(users).where(like(users.nis, `${TEST_NIS_PREFIX}%`));

  // Seed a throwaway admin + student. The student is the role-enforcement target.
  await db.insert(users).values([
    {
      id: seededAdminId,
      nis: `${TEST_NIS_PREFIX}admin`,
      name: "ZZT Admin",
      password: "x",
      role: "admin",
      groupId: null,
      isActive: 1,
    },
    {
      id: seededStudentId,
      nis: `${TEST_NIS_PREFIX}student`,
      name: "ZZT Student",
      password: "x",
      role: "student",
      groupId: null,
      isActive: 1,
    },
  ]);
}

/**
 * Sends an authenticated admin request and returns [status, parsed-body].
 *
 * This test mounts the route plugin in isolation (no global `onError` from
 * `index.ts`), so thrown `AppError`s are serialized as a plain-text message
 * rather than a JSON envelope. We therefore parse JSON best-effort and fall back
 * to the raw text — error-path assertions only check the status code anyway.
 */
async function adminRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<[number, any]> {
  const res = await app.handle(
    new Request(`http://localhost/api/admin${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  const text = await res.text();
  if (!text) return [res.status, null];
  try {
    return [res.status, JSON.parse(text)];
  } catch {
    return [res.status, text];
  }
}

afterAll(async () => {
  if (!dbReady) return;
  // Purge every fixture row created by this suite (zzt_ prefix only).
  await db.delete(users).where(like(users.nis, `${TEST_NIS_PREFIX}%`));
});

describe("Admin supervisor CRUD — DB integration", () => {
  let createdId = "";
  const createdNis = `${TEST_NIS_PREFIX}sup1`;

  it.skipIf(!dbReady)("creates a supervisor (201)", async () => {
    const [status, body] = await adminRequest("POST", "/supervisors", {
      nis: createdNis,
      name: "Pengawas Satu",
      password: "secret123",
    });
    expect(status).toBe(201);
    expect(body.nis).toBe(createdNis);
    expect(body.name).toBe("Pengawas Satu");
    expect(body.isActive).toBe(true);
    // Plaintext is retained for credential distribution; hash is never returned.
    expect(body.initialPassword).toBe("secret123");
    expect(body).not.toHaveProperty("password");
    expect(typeof body.id).toBe("string");
    createdId = body.id;
  });

  it.skipIf(!dbReady)("rejects a duplicate NIS (409)", async () => {
    const [status] = await adminRequest("POST", "/supervisors", {
      nis: createdNis,
      name: "Duplikat",
      password: "secret123",
    });
    expect(status).toBe(409);
  });

  it.skipIf(!dbReady)("updates the supervisor profile", async () => {
    const newNis = `${TEST_NIS_PREFIX}sup1b`;
    const [status, body] = await adminRequest("PUT", `/supervisors/${createdId}`, {
      nis: newNis,
      name: "Pengawas Berubah",
      isActive: false,
    });
    expect(status).toBe(200);
    expect(body.nis).toBe(newNis);
    expect(body.name).toBe("Pengawas Berubah");
    expect(body.isActive).toBe(false);
  });

  it.skipIf(!dbReady)("resets the supervisor password", async () => {
    const [status, body] = await adminRequest(
      "PATCH",
      `/supervisors/${createdId}/password`,
      { password: "newsecret456" }
    );
    expect(status).toBe(200);
    expect(body.initialPassword).toBe("newsecret456");
  });

  it.skipIf(!dbReady)(
    "returns 404 when operating on a non-supervisor id (role enforcement)",
    async () => {
      // seededStudentId exists in `users` but has role = 'student'.
      const [status] = await adminRequest("PUT", `/supervisors/${seededStudentId}`, {
        name: "Tidak Boleh",
      });
      expect(status).toBe(404);
    }
  );

  it.skipIf(!dbReady)("deletes the supervisor, then 404 on subsequent ops", async () => {
    const [delStatus, delBody] = await adminRequest(
      "DELETE",
      `/supervisors/${createdId}`
    );
    expect(delStatus).toBe(200);
    expect(delBody.success).toBe(true);

    // A second delete (now gone) must 404.
    const [againStatus] = await adminRequest("DELETE", `/supervisors/${createdId}`);
    expect(againStatus).toBe(404);

    // A password reset on the deleted id must 404 too.
    const [pwStatus] = await adminRequest(
      "PATCH",
      `/supervisors/${createdId}/password`,
      { password: "whatever123" }
    );
    expect(pwStatus).toBe(404);
  });
});
