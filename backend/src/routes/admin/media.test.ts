/**
 * Azhura CBT Backend — Media `from-url` rehost route tests (#190).
 *
 * Covers the always-run, DB-free behaviour of `POST /api/admin/media/from-url`:
 * 1. Auth/role gating (401 unauthenticated, 403 student/supervisor).
 * 2. Body validation (422 when `url` is missing/empty).
 * 3. The SSRF guard surfaces as a 400 for a private/loopback target — this path
 *    rejects before any network fetch or DB write, so it needs neither. The
 *    success path (download → audit → store) is unit-tested in
 *    `lib/rehost-media.test.ts`; here we only assert the route wiring + guard.
 */

// Import the db module first to break the db↔logger import cycle (see questions.test.ts).
import "../../db";

import { describe, it, expect } from "bun:test";
import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { getJwtSecret } from "../../lib/env";
import { adminMediaRoutes } from "./media";

const app = new Elysia().group("/api", (a) => a.use(adminMediaRoutes));

const tokenSigner = new Elysia()
  .use(jwt({ name: "jwt", secret: getJwtSecret() }))
  .get("/__sign", ({ jwt, query }) =>
    jwt.sign({ userId: query.userId ?? "u-test", nis: "00000", role: query.role ?? "admin", groupId: "" })
  );

async function signToken(role: string): Promise<string> {
  const res = await tokenSigner.handle(new Request(`http://localhost/__sign?role=${role}`));
  return res.text();
}

const URL_ENDPOINT = "http://localhost/api/admin/media/from-url";

function post(body: unknown, token?: string): Promise<Response> {
  return app.handle(
    new Request(URL_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/admin/media/from-url — auth gating", () => {
  it("returns 401 without a token", async () => {
    const res = await post({ url: "https://cdn.example.com/a.png" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a student", async () => {
    const res = await post({ url: "https://cdn.example.com/a.png" }, await signToken("student"));
    expect(res.status).toBe(403);
  });

  it("returns 403 for a supervisor", async () => {
    const res = await post({ url: "https://cdn.example.com/a.png" }, await signToken("supervisor"));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/media/from-url — validation & SSRF guard", () => {
  it("returns 422 when url is missing", async () => {
    const res = await post({}, await signToken("admin"));
    expect(res.status).toBe(422);
  });

  it("rejects a loopback target with 400 (no fetch, no DB)", async () => {
    // The blocked-host guard rejects before any network or DB access. The JSON
    // {message,code} envelope is added by index.ts's onError (not wired in this
    // isolated app), so we assert on the status the thrown AppError carries.
    const res = await post({ url: "http://127.0.0.1:9000/secret.png" }, await signToken("admin"));
    expect(res.status).toBe(400);
  });

  it("rejects a non-http(s) scheme with 400", async () => {
    const res = await post({ url: "ftp://files.example.com/a.png" }, await signToken("admin"));
    expect(res.status).toBe(400);
  });
});
