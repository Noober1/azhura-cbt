import { describe, it, expect, beforeEach } from "bun:test";
import { Elysia } from "elysia";
import { infoRoutes } from "./info";
import { _resetSchoolInfoConfig } from "../lib/env";

const app = new Elysia().group("/api", (a) => a.use(infoRoutes));

describe("GET /api/info", () => {
  beforeEach(() => {
    delete process.env.SCHOOL_NAME;
    delete process.env.SCHOOL_ADDRESS;
    delete process.env.APP_VERSION;
    _resetSchoolInfoConfig();
  });

  it("returns 200 with required shape when env vars are unset", async () => {
    const res = await app.handle(new Request("http://localhost/api/info"));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.schoolName).toBe("string");
    expect(typeof body.address).toBe("string");
    expect(typeof body.appVersion).toBe("string");
  });

  it("returns env-configured values", async () => {
    process.env.SCHOOL_NAME = "SMP Negeri Test";
    process.env.SCHOOL_ADDRESS = "Jl. Test No. 1";
    process.env.APP_VERSION = "2.0.0";

    const res = await app.handle(new Request("http://localhost/api/info"));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.schoolName).toBe("SMP Negeri Test");
    expect(body.address).toBe("Jl. Test No. 1");
    expect(body.appVersion).toBe("2.0.0");
  });

  it("does not require authentication", async () => {
    const res = await app.handle(new Request("http://localhost/api/info"));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
