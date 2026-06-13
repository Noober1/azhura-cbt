import { describe, it, expect } from "bun:test";
import { parseByteRange } from "./http-range";

const SIZE = 1000;

describe("parseByteRange", () => {
  it("returns null when no range header is present", () => {
    expect(parseByteRange(undefined, SIZE)).toBeNull();
    expect(parseByteRange("", SIZE)).toBeNull();
  });

  it("returns null for an unparseable header (serve full 200)", () => {
    expect(parseByteRange("bytes=abc", SIZE)).toBeNull();
    expect(parseByteRange("items=0-10", SIZE)).toBeNull();
    expect(parseByteRange("bytes=-", SIZE)).toBeNull();
  });

  it("parses a closed range bytes=start-end (inclusive)", () => {
    expect(parseByteRange("bytes=0-1023", SIZE)).toEqual({ start: 0, end: 999 }); // clamped to size-1
    expect(parseByteRange("bytes=100-199", SIZE)).toEqual({ start: 100, end: 199 });
  });

  it("parses an open-ended range bytes=start- to the last byte", () => {
    expect(parseByteRange("bytes=500-", SIZE)).toEqual({ start: 500, end: 999 });
    expect(parseByteRange("bytes=0-", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("parses a suffix range bytes=-n as the last n bytes", () => {
    expect(parseByteRange("bytes=-200", SIZE)).toEqual({ start: 800, end: 999 });
    // Suffix larger than the file clamps to the whole file.
    expect(parseByteRange("bytes=-5000", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseByteRange(" bytes=0-99 ", SIZE)).toEqual({ start: 0, end: 99 });
  });

  it("flags an out-of-bounds start as unsatisfiable (→ 416)", () => {
    expect(parseByteRange("bytes=1000-1100", SIZE)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=2000-", SIZE)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-0", SIZE)).toBe("unsatisfiable");
  });

  it("returns null for an empty resource", () => {
    expect(parseByteRange("bytes=0-10", 0)).toBeNull();
  });
});
