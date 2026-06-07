/**
 * Azhura CBT Backend — Public Info Route Tests
 *
 * `GET /api/info` now composes its school name/address from the `settings` table
 * (single source of truth) and the app version from env. The DB read is covered
 * manually / by E2E (route tests avoid the live DB per project convention); here
 * we unit-test the pure mapping and the env-backed app version.
 */

// Load the DB module first to defuse the latent db → logger → log-files →
// log-store → db import cycle (env.ts also pulls in the logger). Loading `db`
// as the cycle entry avoids a `createLogger` TDZ error when this file shares a
// `bun test` run with others.
import "../db";

import { describe, it, expect, beforeEach } from "bun:test";
import { buildSchoolInfo } from "./info";
import { getAppVersion, _resetAppVersion } from "../lib/env";

describe("buildSchoolInfo", () => {
  it("maps settings school name/address and app version onto SchoolInfo", () => {
    const info = buildSchoolInfo(
      { schoolName: "SMP Negeri Test", schoolAddress: "Jl. Test No. 1" },
      "2.0.0"
    );
    expect(info).toStrictEqual({
      schoolName: "SMP Negeri Test",
      address: "Jl. Test No. 1",
      appVersion: "2.0.0",
    });
  });

  it("passes an empty address through unchanged", () => {
    const info = buildSchoolInfo({ schoolName: "Azhura CBT", schoolAddress: "" }, "1.0.0");
    expect(info.address).toBe("");
  });
});

describe("getAppVersion", () => {
  beforeEach(() => {
    delete process.env.APP_VERSION;
    _resetAppVersion();
  });

  it("defaults to 1.0.0 when APP_VERSION is unset", () => {
    expect(getAppVersion()).toBe("1.0.0");
  });

  it("returns the env-configured version", () => {
    process.env.APP_VERSION = "3.1.4";
    _resetAppVersion();
    expect(getAppVersion()).toBe("3.1.4");
  });
});
