import { describe, it, expect } from "vitest";
import {
  mediaPlayKey,
  computeIntegrity,
  parseMaxPlaysAttr,
  parseNoSeekAttr,
} from "../media-integrity";

describe("mediaPlayKey", () => {
  it("combines questionId and src", () => {
    expect(mediaPlayKey("q1", "/uploads/audio/a.mp3")).toBe("q1:/uploads/audio/a.mp3");
  });

  it("falls back to a stable prefix when questionId is absent", () => {
    expect(mediaPlayKey(undefined, "x.mp3")).toBe("q:x.mp3");
  });
});

describe("computeIntegrity", () => {
  it("is unlimited when maxPlays is null", () => {
    expect(computeIntegrity(99, null)).toEqual({ playsRemaining: null, limitReached: false });
  });

  it("reports remaining plays below the cap", () => {
    expect(computeIntegrity(0, 2)).toEqual({ playsRemaining: 2, limitReached: false });
    expect(computeIntegrity(1, 2)).toEqual({ playsRemaining: 1, limitReached: false });
  });

  it("reaches the limit exactly at the cap", () => {
    expect(computeIntegrity(2, 2)).toEqual({ playsRemaining: 0, limitReached: true });
  });

  it("clamps remaining at zero and stays limited past the cap", () => {
    expect(computeIntegrity(5, 2)).toEqual({ playsRemaining: 0, limitReached: true });
  });
});

describe("parseMaxPlaysAttr", () => {
  it("returns null (unlimited) when the attribute is absent", () => {
    expect(parseMaxPlaysAttr(null)).toBeNull();
  });

  it("parses a positive integer", () => {
    expect(parseMaxPlaysAttr("3")).toBe(3);
  });

  it("rejects zero, negatives, and garbage as unlimited", () => {
    expect(parseMaxPlaysAttr("0")).toBeNull();
    expect(parseMaxPlaysAttr("-2")).toBeNull();
    expect(parseMaxPlaysAttr("abc")).toBeNull();
  });
});

describe("parseNoSeekAttr", () => {
  it("is false when absent", () => {
    expect(parseNoSeekAttr(null)).toBe(false);
  });

  it("is true when present (empty or any non-false value)", () => {
    expect(parseNoSeekAttr("")).toBe(true);
    expect(parseNoSeekAttr("true")).toBe(true);
  });

  it("is false for the explicit string 'false'", () => {
    expect(parseNoSeekAttr("false")).toBe(false);
  });
});
