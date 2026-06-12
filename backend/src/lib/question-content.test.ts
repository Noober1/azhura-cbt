import { describe, it, expect } from "bun:test";
import { findExternalMediaSrc } from "./question-content";

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
