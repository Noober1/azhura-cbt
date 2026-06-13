import { describe, it, expect } from "bun:test";
import { Elysia } from "elysia";
import { applyApiDocs, API_DOCS_PATH, API_DOCS_SPEC_PATH } from "./api-docs";

/**
 * #177 — the docs surface must be gated. When enabled it serves an interactive
 * page; when disabled the route must not exist at all (no leaked API surface in
 * production). We assert both branches against a throwaway app.
 */
describe("applyApiDocs — gating", () => {
  it("serves the docs page at /api/docs when enabled", async () => {
    const app = applyApiDocs(new Elysia(), { enabled: true, version: "9.9.9" });
    const res = await app.handle(new Request(`http://localhost${API_DOCS_PATH}`));
    expect(res.status).toBe(200);
    const body = await res.text();
    // Scalar/Swagger UI returns an HTML shell.
    expect(body.toLowerCase()).toContain("<!doctype html");
    // The Scalar UI must point at the *absolute* spec path; a relative URL
    // resolves to the broken `/api/api/docs/json` under the two-segment path.
    expect(body).toContain(`data-url="${API_DOCS_SPEC_PATH}"`);
  });

  it("serves the OpenAPI spec at the absolute spec path", async () => {
    const app = applyApiDocs(new Elysia(), { enabled: true, version: "9.9.9" });
    const res = await app.handle(new Request(`http://localhost${API_DOCS_SPEC_PATH}`));
    expect(res.status).toBe(200);
    const spec = (await res.json()) as { info?: { title?: string } };
    expect(spec.info?.title).toBe("Azhura CBT API");
  });

  it("does not register the docs route when disabled (404)", async () => {
    const app = applyApiDocs(new Elysia(), { enabled: false, version: "9.9.9" });
    const res = await app.handle(new Request(`http://localhost${API_DOCS_PATH}`));
    expect(res.status).toBe(404);
  });

  it("returns the same app instance untouched when disabled", () => {
    const base = new Elysia();
    const result = applyApiDocs(base, { enabled: false, version: "1.0.0" });
    expect(result).toBe(base);
  });
});
