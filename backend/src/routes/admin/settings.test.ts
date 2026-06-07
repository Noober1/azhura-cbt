/**
 * Azhura CBT Backend — Admin Settings Tests
 *
 * Two layers:
 * 1. Pure unit tests for the settings registry (serialize/deserialize/projectRows) —
 *    no DB or HTTP needed; run fast and cover most logic branches.
 * 2. Route-level smoke tests for auth gating (401/403) via app.handle() —
 *    no real DB needed for these because auth failures short-circuit before any DB call.
 *
 * DB-touching integration tests (PATCH persists, GET reflects) are left for
 * manual or E2E coverage because `bun test` requires `backend/.env` with live DB
 * credentials (see project memory on backend test env).
 */

import { describe, it, expect } from "bun:test";
import { Elysia } from "elysia";
import {
  serialize,
  deserialize,
  projectRows,
  SETTINGS_DEFAULTS,
  SETTING_KEYS,
} from "../../lib/settings-registry";
import type { SystemSettings } from "../../lib/settings-registry";
import type { Setting } from "../../db/schema";

// ── Registry unit tests ──────────────────────────────────────────────────────

describe("settings-registry: serialize", () => {
  it("serializes boolean true as 'true'", () => {
    expect(serialize("antiCheatEnabled", true)).toBe("true");
  });

  it("serializes boolean false as 'false'", () => {
    expect(serialize("antiCheatEnabled", false)).toBe("false");
  });

  it("serializes numbers as decimal strings", () => {
    expect(serialize("defaultExamDurationMinutes", 60)).toBe("60");
    expect(serialize("defaultPassingGrade", 75)).toBe("75");
  });

  it("passes strings through as-is", () => {
    expect(serialize("schoolName", "SMP Test")).toBe("SMP Test");
    expect(serialize("schoolAddress", "Jl. Test No. 1")).toBe("Jl. Test No. 1");
  });
});

describe("settings-registry: deserialize", () => {
  it("parses 'true'/'false' to booleans", () => {
    expect(deserialize("antiCheatEnabled", "true")).toBe(true);
    expect(deserialize("antiCheatEnabled", "false")).toBe(false);
    // Anything other than "true" is false
    expect(deserialize("antiCheatEnabled", "1")).toBe(false);
  });

  it("parses numeric strings to numbers", () => {
    expect(deserialize("defaultExamDurationMinutes", "90")).toBe(90);
    expect(deserialize("defaultPassingGrade", "80")).toBe(80);
  });

  it("falls back to default when numeric string is not finite", () => {
    expect(deserialize("defaultExamDurationMinutes", "nan")).toBe(
      SETTINGS_DEFAULTS.defaultExamDurationMinutes
    );
    expect(deserialize("defaultPassingGrade", "abc")).toBe(
      SETTINGS_DEFAULTS.defaultPassingGrade
    );
  });

  it("returns strings as-is", () => {
    expect(deserialize("schoolName", "SMK Negeri 2")).toBe("SMK Negeri 2");
  });

  it("round-trips all defaults without data loss", () => {
    for (const key of SETTING_KEYS) {
      const typedKey = key as keyof SystemSettings;
      const raw = serialize(typedKey, SETTINGS_DEFAULTS[typedKey]);
      const back = deserialize(typedKey, raw);
      expect(back).toStrictEqual(SETTINGS_DEFAULTS[typedKey]);
    }
  });
});

describe("settings-registry: projectRows", () => {
  it("returns full defaults when rows array is empty", () => {
    const result = projectRows([]);
    expect(result).toStrictEqual(SETTINGS_DEFAULTS);
  });

  it("overrides a stored key while keeping other defaults", () => {
    const rows: Setting[] = [
      { key: "schoolName", value: "SMPN 5", updatedAt: 0 },
    ];
    const result = projectRows(rows);
    expect(result.schoolName).toBe("SMPN 5");
    expect(result.antiCheatEnabled).toBe(SETTINGS_DEFAULTS.antiCheatEnabled);
    expect(result.defaultExamDurationMinutes).toBe(
      SETTINGS_DEFAULTS.defaultExamDurationMinutes
    );
  });

  it("ignores rows with unknown keys", () => {
    const rows: Setting[] = [
      { key: "unknownFeatureFlag", value: "yes", updatedAt: 0 },
    ];
    const result = projectRows(rows);
    expect(result).toStrictEqual(SETTINGS_DEFAULTS);
  });

  it("projects all keys correctly when all rows present", () => {
    const rows: Setting[] = [
      { key: "schoolName", value: "SMK Alpha", updatedAt: 0 },
      { key: "schoolAddress", value: "Jl. Merdeka 1", updatedAt: 0 },
      { key: "defaultExamDurationMinutes", value: "45", updatedAt: 0 },
      { key: "defaultPassingGrade", value: "70", updatedAt: 0 },
      { key: "antiCheatEnabled", value: "true", updatedAt: 0 },
    ];
    const result = projectRows(rows);
    expect(result).toStrictEqual({
      schoolName: "SMK Alpha",
      schoolAddress: "Jl. Merdeka 1",
      defaultExamDurationMinutes: 45,
      defaultPassingGrade: 70,
      antiCheatEnabled: true,
    });
  });
});

// ── Route auth-gating smoke tests ────────────────────────────────────────────
// These mount the real route plugin via app.handle() but do NOT hit the DB
// because auth failures short-circuit in the middleware before any DB call.

import { adminSettingsRoutes } from "./settings";

const app = new Elysia().group("/api", (a) => a.use(adminSettingsRoutes));

describe("GET /api/admin/settings — auth gating", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/admin/settings")
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when the token is malformed", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/admin/settings", {
        headers: { authorization: "Bearer not-a-real-token" },
      })
    );
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/admin/settings — auth gating", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schoolName: "Test" }),
      })
    );
    expect(res.status).toBe(401);
  });
});
