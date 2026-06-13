import { describe, it, expect } from "vitest";
import { buildExamCsp, applyCspMeta } from "./csp";

/** Pull a single directive's value out of a built CSP string. */
function directive(csp: string, name: string): string {
  const part = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `));
  return part ?? "";
}

describe("buildExamCsp", () => {
  it("allows the https backend origin for media and its wss origin for connect", () => {
    const csp = buildExamCsp("https://exam.school.id");

    expect(directive(csp, "img-src")).toContain("https://exam.school.id");
    expect(directive(csp, "media-src")).toContain("https://exam.school.id");
    expect(directive(csp, "connect-src")).toContain("https://exam.school.id");
    expect(directive(csp, "connect-src")).toContain("wss://exam.school.id");
  });

  it("derives ws:// from an http backend origin for connect-src", () => {
    const csp = buildExamCsp("http://localhost:3000");

    expect(directive(csp, "connect-src")).toContain("http://localhost:3000");
    expect(directive(csp, "connect-src")).toContain("ws://localhost:3000");
  });

  it("emits self-only sources when serverUrl is empty (still blocks external)", () => {
    const csp = buildExamCsp("");

    expect(directive(csp, "img-src")).toBe("img-src 'self' data: blob:");
    expect(directive(csp, "media-src")).toBe("media-src 'self' blob:");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    expect(csp).not.toContain("http://");
    expect(csp).not.toContain("https://");
    expect(csp).not.toContain("ws://");
  });

  it("falls back to self-only for invalid input without throwing", () => {
    expect(() => buildExamCsp("notaurl")).not.toThrow();
    const csp = buildExamCsp("notaurl");

    expect(directive(csp, "img-src")).toBe("img-src 'self' data: blob:");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
  });

  it("always includes the fixed hardening directives", () => {
    const csp = buildExamCsp("https://exam.school.id");

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(directive(csp, "style-src")).toContain("'unsafe-inline'");
    expect(directive(csp, "script-src")).toContain("'unsafe-inline'");
  });
});

/**
 * Minimal fake DOM exercising the upsert/create branches of `applyCspMeta`
 * without a browser environment (vitest runs in `node`). Tracks the single
 * `<meta>` it manages so the test can assert no duplicates accumulate.
 */
function createFakeDoc() {
  const metas: Array<{ attrs: Record<string, string>; setAttribute: (k: string, v: string) => void }> = [];
  const makeEl = () => {
    const attrs: Record<string, string> = {};
    return { attrs, setAttribute: (k: string, v: string) => { attrs[k] = v; } };
  };
  return {
    metas,
    head: {
      querySelector: () =>
        metas.find((m) => m.attrs["http-equiv"] === "Content-Security-Policy") ?? null,
      appendChild: (el: ReturnType<typeof makeEl>) => { metas.push(el); },
    },
    createElement: () => makeEl(),
  } as unknown as Document & { metas: ReturnType<typeof makeEl>[] };
}

describe("applyCspMeta", () => {
  it("creates a single CSP meta tag when none exists", () => {
    const doc = createFakeDoc();
    applyCspMeta("default-src 'self'", doc);

    expect(doc.metas).toHaveLength(1);
    expect(doc.metas[0].attrs["http-equiv"]).toBe("Content-Security-Policy");
    expect(doc.metas[0].attrs.content).toBe("default-src 'self'");
  });

  it("upserts the existing tag in place instead of duplicating it", () => {
    const doc = createFakeDoc();
    applyCspMeta("default-src 'self'", doc);
    applyCspMeta("img-src 'self'", doc);

    expect(doc.metas).toHaveLength(1);
    expect(doc.metas[0].attrs.content).toBe("img-src 'self'");
  });

  it("is a no-op when no document is available", () => {
    expect(() => applyCspMeta("default-src 'self'", undefined)).not.toThrow();
  });
});
