import { describe, it, expect } from "bun:test";
import {
  findExternalMediaSrc,
  isLocalUploadPath,
  rewriteEmbeddedMedia,
  type MediaRewrite,
  type MediaTokenKind,
} from "./question-content";

describe("findExternalMediaSrc", () => {
  it("accepts stems with no media", () => {
    expect(findExternalMediaSrc("<p>Berapa 2 + 2?</p>")).toBeNull();
    expect(findExternalMediaSrc("")).toBeNull();
  });

  it("accepts local /uploads/ images", () => {
    expect(
      findExternalMediaSrc('<p>Lihat:</p><img src="/uploads/abc.webp" alt="x">')
    ).toBeNull();
  });

  it("accepts local /uploads/ audio and video", () => {
    const html =
      '<audio src="/uploads/a.mp3"></audio><video src="/uploads/v.mp4" poster="/uploads/p.webp"></video>';
    expect(findExternalMediaSrc(html)).toBeNull();
  });

  it("rejects an external https image and returns the offending src", () => {
    expect(
      findExternalMediaSrc('<img src="https://evil.example.com/track.gif">')
    ).toBe("https://evil.example.com/track.gif");
  });

  it("rejects protocol-relative and other schemes", () => {
    expect(findExternalMediaSrc('<img src="//evil.example.com/x.png">')).toBe(
      "//evil.example.com/x.png"
    );
    expect(findExternalMediaSrc('<img src="data:image/png;base64,AAAA">')).toBe(
      "data:image/png;base64,AAAA"
    );
  });

  it("rejects an external <video> poster even when its src is local", () => {
    expect(
      findExternalMediaSrc(
        '<video src="/uploads/v.mp4" poster="https://evil.example.com/p.jpg"></video>'
      )
    ).toBe("https://evil.example.com/p.jpg");
  });

  it("handles single-quoted and bare attribute values", () => {
    expect(findExternalMediaSrc("<img src='https://evil.example.com/y.png'>")).toBe(
      "https://evil.example.com/y.png"
    );
    expect(findExternalMediaSrc("<img src=https://evil.example.com/z.png>")).toBe(
      "https://evil.example.com/z.png"
    );
  });

  it("returns the first offender when several media are present", () => {
    const html =
      '<img src="/uploads/ok.webp"><img src="https://evil.example.com/first.gif"><img src="https://evil.example.com/second.gif">';
    expect(findExternalMediaSrc(html)).toBe("https://evil.example.com/first.gif");
  });

  it("rejects an empty src as a non-/uploads value (returns the empty string)", () => {
    // Caller distinguishes this from "all clean" via `!== null`, not truthiness.
    expect(findExternalMediaSrc('<img src="">')).toBe("");
  });

  it("rejects an external srcset candidate list (responsive-image vector)", () => {
    const html = '<img srcset="https://evil.example.com/x.png 1x">';
    expect(findExternalMediaSrc(html)).not.toBeNull();
  });

  it("rejects a srcset even when a sibling src is local", () => {
    const html =
      '<img src="/uploads/ok.webp" srcset="https://evil.example.com/hi.png 2x">';
    expect(findExternalMediaSrc(html)).not.toBeNull();
  });

  it("rejects an external CSS url() in an inline style (background-image vector)", () => {
    expect(
      findExternalMediaSrc(
        '<p style="background-image:url(https://evil.example.com/track.gif)">x</p>'
      )
    ).toBe("https://evil.example.com/track.gif");
    // Quoted and spaced variants are caught too.
    expect(
      findExternalMediaSrc("<p style=\"background:url( 'https://evil.example.com/y.png' )\">x</p>")
    ).toBe("https://evil.example.com/y.png");
  });

  it("accepts a local /uploads CSS url()", () => {
    expect(
      findExternalMediaSrc('<p style="background-image:url(/uploads/bg.webp)">x</p>')
    ).toBeNull();
  });
});

describe("isLocalUploadPath", () => {
  it("accepts a served /uploads/ path", () => {
    expect(isLocalUploadPath("/uploads/images/x.webp")).toBe(true);
  });

  it("rejects absolute, protocol-relative, scheme, and empty values", () => {
    expect(isLocalUploadPath("https://evil.example.com/uploads/x.webp")).toBe(false);
    expect(isLocalUploadPath("//evil.example.com/x.png")).toBe(false);
    expect(isLocalUploadPath("data:image/png;base64,AAAA")).toBe(false);
    expect(isLocalUploadPath("")).toBe(false);
  });
});

describe("rewriteEmbeddedMedia", () => {
  /** A decide() that uppercases the offending value — proves which token was visited. */
  const upperExternal = (value: string): MediaRewrite =>
    isLocalUploadPath(value) ? "keep" : { replace: value.toUpperCase() };

  it("leaves clean stems untouched", () => {
    const html = '<p>Berapa 2 + 2?</p><img src="/uploads/ok.webp" alt="x">';
    expect(rewriteEmbeddedMedia(html, upperExternal)).toBe(html);
  });

  it("returns the input string when there is no media at all", () => {
    expect(rewriteEmbeddedMedia("<p>plain</p>", () => "drop")).toBe("<p>plain</p>");
  });

  it("replaces an external src while preserving the attribute name and double quotes", () => {
    expect(
      rewriteEmbeddedMedia('<img src="https://x/y.png" alt="a">', () => ({
        replace: "/uploads/y.png",
      }))
    ).toBe('<img src="/uploads/y.png" alt="a">');
  });

  it("preserves single-quoted and bare value quoting on replace", () => {
    expect(
      rewriteEmbeddedMedia("<img src='https://x/y.png'>", () => ({ replace: "/uploads/y.png" }))
    ).toBe("<img src='/uploads/y.png'>");
    expect(
      rewriteEmbeddedMedia("<img src=https://x/y.png>", () => ({ replace: "/uploads/y.png" }))
    ).toBe("<img src=/uploads/y.png>");
  });

  it("preserves whitespace around the '=' on replace", () => {
    expect(
      rewriteEmbeddedMedia('<img src = "https://x/y.png">', () => ({ replace: "/uploads/y.png" }))
    ).toBe('<img src = "/uploads/y.png">');
  });

  it("drops an external attribute entirely (whole name=value token removed)", () => {
    expect(rewriteEmbeddedMedia('<img src="https://x/y.png" alt="a">', () => "drop")).toBe(
      '<img  alt="a">'
    );
  });

  it("relativizes a self-origin src but drops a genuinely external one in the same stem", () => {
    const html =
      '<img src="http://localhost:3000/uploads/a.png"><img src="https://evil/b.gif">';
    const decide = (value: string): MediaRewrite => {
      if (isLocalUploadPath(value)) return "keep";
      const prefix = "http://localhost:3000/uploads/";
      if (value.startsWith(prefix)) return { replace: value.slice("http://localhost:3000".length) };
      return "drop";
    };
    expect(rewriteEmbeddedMedia(html, decide)).toBe('<img src="/uploads/a.png"><img >');
  });

  it("replaces an external CSS url() preserving the url() wrapper and quoting", () => {
    expect(
      rewriteEmbeddedMedia('<p style="background-image:url(https://x/bg.png)">x</p>', () => ({
        replace: "/uploads/bg.png",
      }))
    ).toBe('<p style="background-image:url(/uploads/bg.png)">x</p>');
    expect(
      rewriteEmbeddedMedia("<p style=\"background:url('https://x/bg.png')\">x</p>", () => ({
        replace: "/uploads/bg.png",
      }))
    ).toBe("<p style=\"background:url('/uploads/bg.png')\">x</p>");
  });

  it("turns a dropped CSS url() into the `none` keyword so the declaration stays valid", () => {
    expect(
      rewriteEmbeddedMedia('<p style="background-image:url(https://x/bg.png)">x</p>', () => "drop")
    ).toBe('<p style="background-image:none">x</p>');
  });

  it("tags attribute vs css tokens via the kind argument", () => {
    const kinds: MediaTokenKind[] = [];
    rewriteEmbeddedMedia(
      '<img src="https://x/a.png"><p style="background:url(https://x/b.png)">y</p>',
      (_value, kind) => {
        kinds.push(kind);
        return "keep";
      }
    );
    expect(kinds).toEqual(["attr", "css"]);
  });

  it("is idempotent: rewriting already-local media is a no-op", () => {
    const cleaned = rewriteEmbeddedMedia('<img src="https://x/y.png">', () => ({
      replace: "/uploads/y.png",
    }));
    expect(rewriteEmbeddedMedia(cleaned, upperExternal)).toBe(cleaned);
  });
});
