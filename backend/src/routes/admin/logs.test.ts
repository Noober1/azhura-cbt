/**
 * Azhura CBT Backend — Admin Log Viewer Route Tests (#18)
 *
 * Route-level smoke tests for auth gating (401) via `app.handle()`. Auth
 * failures short-circuit in the middleware before any DB call, so these need no
 * live database. DB-touching integration (filtering/pagination over real rows)
 * is left to manual/E2E coverage — `bun test` requires `backend/.env` with live
 * DB credentials (see project memory on backend test env).
 */

import { describe, it, expect } from "bun:test";
import { Elysia } from "elysia";
import { adminLogsRoutes } from "./logs";

const app = new Elysia().group("/api", (a) => a.use(adminLogsRoutes));

describe("GET /api/admin/logs — auth gating", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const res = await app.handle(new Request("http://localhost/api/admin/logs"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the token is malformed", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/admin/logs", {
        headers: { authorization: "Bearer not-a-real-token" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated access regardless of query filters", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/admin/logs?stream=event&page=2&limit=10")
    );
    expect(res.status).toBe(401);
  });
});
