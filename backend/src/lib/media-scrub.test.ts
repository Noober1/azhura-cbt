import { describe, it, expect } from "bun:test";
import {
  classifyMediaUrl,
  relativizeSelfOrigin,
  normalizeOrigins,
  collectStemMedia,
  scrubStemMedia,
  scrubImageUrl,
  type ScrubContext,
  type RehostFn,
} from "./media-scrub";
import type { SavedFile } from "./upload";

const SELF = ["http://localhost:3000"];

/** A rehost stub that "stores" any URL at a deterministic local path. */
const rehostOk: RehostFn = async (url) => {
  const saved: SavedFile = {
    filename: "uuid.png",
    originalName: "x.png",
    type: "image",
    mimeType: "image/png",
    sizeBytes: 3,
    url: `/uploads/images/rehosted-${encodeURIComponent(url).slice(-8)}.png`,
  };
  return { ok: true, saved };
};

/** A rehost stub that always fails. */
const rehostFail: RehostFn = async () => ({ ok: false, reason: "fetch-failed" });

function ctx(over: Partial<ScrubContext> = {}): ScrubContext {
  return { selfOrigins: SELF, rehost: rehostOk, stripFailed: false, ...over };
}

describe("normalizeOrigins", () => {
  it("trims and strips trailing slashes, dropping blanks", () => {
    expect(normalizeOrigins(["http://x:3000/", " http://y ", "", "http://z///"])).toEqual([
      "http://x:3000",
      "http://y",
      "http://z",
    ]);
  });
});

describe("classifyMediaUrl", () => {
  it("classifies local /uploads/ paths", () => {
    expect(classifyMediaUrl("/uploads/images/a.png", SELF)).toBe("local");
  });
  it("classifies self-origin absolute upload URLs", () => {
    expect(classifyMediaUrl("http://localhost:3000/uploads/images/a.png", SELF)).toBe("self-origin");
  });
  it("classifies foreign absolute URLs as external (even under /uploads/)", () => {
    expect(classifyMediaUrl("https://evil.example.com/uploads/a.png", SELF)).toBe("external");
    expect(classifyMediaUrl("https://cdn.example.com/a.png", SELF)).toBe("external");
  });
  it("does not treat a same-origin non-/uploads path as self-origin", () => {
    expect(classifyMediaUrl("http://localhost:3000/static/a.png", SELF)).toBe("external");
  });
});

describe("relativizeSelfOrigin", () => {
  it("strips our origin from a self-origin upload URL", () => {
    expect(relativizeSelfOrigin("http://localhost:3000/uploads/images/a.png", SELF)).toBe(
      "/uploads/images/a.png"
    );
  });
  it("leaves a foreign URL untouched", () => {
    const evil = "https://evil.example.com/uploads/a.png";
    expect(relativizeSelfOrigin(evil, SELF)).toBe(evil);
  });
});

describe("collectStemMedia", () => {
  it("collects distinct non-local refs with classification, ignoring local ones", () => {
    const html =
      '<img src="/uploads/ok.png">' +
      '<img src="http://localhost:3000/uploads/self.png">' +
      '<img src="https://cdn.example.com/a.png">' +
      '<img src="https://cdn.example.com/a.png">'; // duplicate
    expect(collectStemMedia(html, SELF)).toEqual([
      { value: "http://localhost:3000/uploads/self.png", classification: "self-origin" },
      { value: "https://cdn.example.com/a.png", classification: "external" },
    ]);
  });

  it("returns an empty list for a clean stem", () => {
    expect(collectStemMedia('<p>x</p><img src="/uploads/a.png">', SELF)).toEqual([]);
  });
});

describe("scrubImageUrl", () => {
  it("keeps a local path unchanged", async () => {
    const r = await scrubImageUrl("/uploads/images/a.png", ctx());
    expect(r).toMatchObject({ value: "/uploads/images/a.png", changed: false });
    expect(r.action.kind).toBe("keep");
  });

  it("relativizes a self-origin URL", async () => {
    const r = await scrubImageUrl("http://localhost:3000/uploads/images/a.png", ctx());
    expect(r.value).toBe("/uploads/images/a.png");
    expect(r.changed).toBe(true);
    expect(r.action.kind).toBe("relativized");
  });

  it("rehosts an external URL to a local copy", async () => {
    const r = await scrubImageUrl("https://cdn.example.com/a.png", ctx());
    expect(r.value).toMatch(/^\/uploads\/images\/rehosted-/);
    expect(r.changed).toBe(true);
    expect(r.action.kind).toBe("rehosted");
  });

  it("clears the column when an external URL fails and stripFailed is on", async () => {
    const r = await scrubImageUrl("https://dead.example.com/a.png", ctx({ rehost: rehostFail, stripFailed: true }));
    expect(r.value).toBeNull();
    expect(r.changed).toBe(true);
    expect(r.action.kind).toBe("dropped");
  });

  it("leaves an external URL unchanged when it fails and stripFailed is off", async () => {
    const url = "https://dead.example.com/a.png";
    const r = await scrubImageUrl(url, ctx({ rehost: rehostFail, stripFailed: false }));
    expect(r.value).toBe(url);
    expect(r.changed).toBe(false);
    expect(r.action).toMatchObject({ kind: "failed", reason: "fetch-failed" });
  });
});

describe("scrubStemMedia", () => {
  it("leaves a clean local stem untouched", async () => {
    const html = '<p>Soal</p><img src="/uploads/images/a.png">';
    const r = await scrubStemMedia(html, ctx());
    expect(r.html).toBe(html);
    expect(r.changed).toBe(false);
  });

  it("relativizes a self-origin stem image", async () => {
    const r = await scrubStemMedia('<img src="http://localhost:3000/uploads/images/a.png">', ctx());
    expect(r.html).toBe('<img src="/uploads/images/a.png">');
    expect(r.changed).toBe(true);
    expect(r.actions[0].kind).toBe("relativized");
  });

  it("rehosts an external stem image and rewrites to the local copy", async () => {
    const r = await scrubStemMedia('<p>x</p><img src="https://cdn.example.com/a.png" alt="d">', ctx());
    expect(r.html).toMatch(/<img src="\/uploads\/images\/rehosted-[^"]+" alt="d">/);
    expect(r.actions[0].kind).toBe("rehosted");
  });

  it("rehosts an external CSS background-image url()", async () => {
    const r = await scrubStemMedia(
      '<p style="background-image:url(https://cdn.example.com/bg.png)">x</p>',
      ctx()
    );
    expect(r.html).toMatch(/url\(\/uploads\/images\/rehosted-[^)]+\)/);
  });

  it("drops a failed external image when stripFailed is on", async () => {
    const r = await scrubStemMedia('<img src="https://dead.example.com/a.png" alt="d">', ctx({ rehost: rehostFail, stripFailed: true }));
    expect(r.html).toBe('<img  alt="d">');
    expect(r.actions[0].kind).toBe("dropped");
  });

  it("leaves a failed external image in place when stripFailed is off (reported only)", async () => {
    const html = '<img src="https://dead.example.com/a.png">';
    const r = await scrubStemMedia(html, ctx({ rehost: rehostFail, stripFailed: false }));
    expect(r.html).toBe(html);
    expect(r.changed).toBe(false);
    expect(r.actions[0].kind).toBe("failed");
  });

  it("rehosts a repeated URL only once (dedup)", async () => {
    let calls = 0;
    const counting: RehostFn = async (url) => {
      calls++;
      return rehostOk(url);
    };
    const html =
      '<img src="https://cdn.example.com/a.png"><img src="https://cdn.example.com/a.png">';
    const r = await scrubStemMedia(html, ctx({ rehost: counting }));
    expect(calls).toBe(1);
    // Both occurrences rewritten to the same local copy.
    const matches = r.html.match(/\/uploads\/images\/rehosted-/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("is idempotent: a second pass over scrubbed output makes no change", async () => {
    const once = await scrubStemMedia('<img src="https://cdn.example.com/a.png">', ctx());
    const twice = await scrubStemMedia(once.html, ctx());
    expect(twice.changed).toBe(false);
    expect(twice.html).toBe(once.html);
  });

  it("rehosts a URL once when it appears as both an <img src> and a CSS url()", async () => {
    let calls = 0;
    const counting: RehostFn = async (url) => {
      calls++;
      return rehostOk(url);
    };
    const html =
      '<img src="https://cdn.example.com/a.png">' +
      '<p style="background-image:url(https://cdn.example.com/a.png)">x</p>';
    const r = await scrubStemMedia(html, ctx({ rehost: counting }));
    expect(calls).toBe(1); // one distinct source URL → one download
    expect(r.html).toMatch(/<img src="\/uploads\/images\/rehosted-[^"]+">/);
    expect(r.html).toMatch(/url\(\/uploads\/images\/rehosted-[^)]+\)/);
  });

  it("treats a srcset as one non-local token (dropped when stripFailed, since rehost sees an invalid URL)", async () => {
    // srcset is passed whole; a real rehost would return invalid-url for it.
    const invalidUrlRehost: RehostFn = async () => ({ ok: false, reason: "invalid-url" });
    const r = await scrubStemMedia(
      '<img srcset="https://cdn.example.com/a.png 1x, https://cdn.example.com/b.png 2x">',
      ctx({ rehost: invalidUrlRehost, stripFailed: true })
    );
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].kind).toBe("dropped");
    expect(r.html).toBe("<img >");
  });
});
