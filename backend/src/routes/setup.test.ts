/**
 * Azhura CBT Backend — Setup Route Tests
 *
 * Two layers, mirroring the project's route-test convention:
 * 1. Pure unit tests for the `isSetupNeeded` predicate — no DB or HTTP.
 * 2. Route-level validation smoke tests via app.handle() — a malformed body is
 *    rejected by the schema before any DB call, so these need no live DB.
 *
 * DB-touching integration (status reflects admin count, POST creates the admin
 * and then self-locks with 409) is covered by the first-run simulation / E2E,
 * because `bun test` requires `backend/.env` with live DB credentials (see the
 * project memory on backend test env).
 */

// Initialize the DB module before the logger to defuse the latent
// db → logger → log-files → log-store → db import cycle: whichever module loads
// first wins, and loading `db` first avoids a `createLogger` TDZ error when this
// file is bundled with others in one `bun test` run.
import "../db";

import { describe, it, expect } from "bun:test";
import { Elysia } from "elysia";
import { AppError } from "../lib/errors";
import { isSetupNeeded, validateTrimmedSetup } from "../lib/setup-service";
import { setupRoutes } from "./setup";

// ── Predicate unit tests ─────────────────────────────────────────────────────

describe("isSetupNeeded", () => {
  it("is true when there are no admins (fresh install)", () => {
    expect(isSetupNeeded(0)).toBe(true);
  });

  it("is false once at least one admin exists", () => {
    expect(isSetupNeeded(1)).toBe(false);
    expect(isSetupNeeded(5)).toBe(false);
  });

  it("treats a negative count defensively as needing setup", () => {
    expect(isSetupNeeded(-1)).toBe(true);
  });
});

// ── Trimmed-field validation unit tests ──────────────────────────────────────
// Guards the post-trim invariant the route schema can't express (the schema
// length-checks the raw body, before trimming).

describe("validateTrimmedSetup", () => {
  const valid = { adminNis: "88888", adminName: "Admin", schoolName: "SMP Test" };

  it("returns null for valid trimmed input", () => {
    expect(validateTrimmedSetup(valid)).toBeNull();
  });

  it("rejects a blank school name", () => {
    expect(validateTrimmedSetup({ ...valid, schoolName: "" })).toBe(
      "Nama sekolah wajib diisi."
    );
  });

  it("rejects a blank admin name", () => {
    expect(validateTrimmedSetup({ ...valid, adminName: "" })).toBe(
      "Nama admin wajib diisi."
    );
  });

  it("rejects an admin NIS shorter than the minimum (the all-whitespace case)", () => {
    // "     ".trim() === "" — exactly the value that slips past the raw schema.
    expect(validateTrimmedSetup({ ...valid, adminNis: "" })).toBe(
      "NIS admin minimal 5 karakter."
    );
    expect(validateTrimmedSetup({ ...valid, adminNis: "1234" })).toBe(
      "NIS admin minimal 5 karakter."
    );
  });
});

// ── Route validation smoke tests ─────────────────────────────────────────────
// These mount the real route but never reach the DB: an invalid body fails
// schema validation before the handler runs. The test app reuses production's
// error mapping (VALIDATION → 400) so the asserted status matches what real
// clients receive, rather than Elysia's raw 422 default.

const app = new Elysia()
  .onError(({ code, error, set }) => {
    if (error instanceof AppError) {
      set.status = error.status;
      return { message: error.message, code: error.code };
    }
    if (code === "VALIDATION") {
      set.status = 400;
      return { message: "Permintaan tidak valid.", code: "VALIDATION" };
    }
  })
  .group("/api", (a) => a.use(setupRoutes));

describe("POST /api/setup — body validation", () => {
  async function post(body: unknown): Promise<Response> {
    return app.handle(
      new Request("http://localhost/api/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  it("rejects an empty body with 400", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
  });

  it("rejects a too-short admin NIS with 400", async () => {
    const res = await post({
      schoolName: "SMP Test",
      adminName: "Admin",
      adminNis: "123", // < 5 chars
      adminPassword: "secret1",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a too-short admin password with 400", async () => {
    const res = await post({
      schoolName: "SMP Test",
      adminName: "Admin",
      adminNis: "88888",
      adminPassword: "123", // < 6 chars
    });
    expect(res.status).toBe(400);
  });

  it("rejects a blank school name with 400", async () => {
    const res = await post({
      schoolName: "",
      adminName: "Admin",
      adminNis: "88888",
      adminPassword: "secret1",
    });
    expect(res.status).toBe(400);
  });
});
