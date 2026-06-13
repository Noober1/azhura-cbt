import { describe, it, expect } from "vitest";
import { imageFilesFromClipboard, externalImageSrcs } from "./paste-media";

/** Minimal DataTransfer stand-in carrying a fixed file list. */
function clipboard(files: File[]): DataTransfer {
  return { files } as unknown as DataTransfer;
}

describe("imageFilesFromClipboard", () => {
  it("returns [] for null clipboard data", () => {
    expect(imageFilesFromClipboard(null)).toEqual([]);
  });

  it("keeps only image files", () => {
    const png = new File(["x"], "shot.png", { type: "image/png" });
    const txt = new File(["x"], "note.txt", { type: "text/plain" });
    expect(imageFilesFromClipboard(clipboard([png, txt]))).toEqual([png]);
  });
});

describe("externalImageSrcs", () => {
  const isExternal = (src: string) => /^https?:\/\//i.test(src);

  it("returns external image srcs from pasted HTML", () => {
    const html = '<p>hi <img src="https://cdn.example.com/a.png"> there</p>';
    expect(externalImageSrcs(html, isExternal)).toEqual(["https://cdn.example.com/a.png"]);
  });

  it("ignores local /uploads images", () => {
    expect(externalImageSrcs('<img src="/uploads/images/a.png">', isExternal)).toEqual([]);
  });

  it("deduplicates repeated srcs", () => {
    const html = '<img src="https://x/a.png"><img src="https://x/a.png">';
    expect(externalImageSrcs(html, isExternal)).toEqual(["https://x/a.png"]);
  });

  it("returns [] for empty html or html without images", () => {
    expect(externalImageSrcs("", isExternal)).toEqual([]);
    expect(externalImageSrcs("<p>just text</p>", isExternal)).toEqual([]);
  });
});
