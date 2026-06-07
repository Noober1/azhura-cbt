import { describe, it, expect } from "vitest";
import {
  isResolutionSufficient,
  MIN_SCREEN_WIDTH,
  MIN_SCREEN_HEIGHT,
} from "../screen";

describe("isResolutionSufficient", () => {
  it("accepts exactly the minimum resolution", () => {
    expect(isResolutionSufficient(MIN_SCREEN_WIDTH, MIN_SCREEN_HEIGHT)).toBe(true);
  });

  it("accepts a resolution larger than the minimum", () => {
    expect(isResolutionSufficient(1920, 1080)).toBe(true);
  });

  it("rejects when width is one pixel under the minimum", () => {
    expect(isResolutionSufficient(MIN_SCREEN_WIDTH - 1, MIN_SCREEN_HEIGHT)).toBe(false);
  });

  it("rejects when height is one pixel under the minimum", () => {
    expect(isResolutionSufficient(MIN_SCREEN_WIDTH, MIN_SCREEN_HEIGHT - 1)).toBe(false);
  });

  it("rejects a classic 1024×768 monitor", () => {
    expect(isResolutionSufficient(1024, 768)).toBe(false);
  });

  it("fails open on a zero/negative reading so it never self-locks", () => {
    expect(isResolutionSufficient(0, 0)).toBe(true);
    expect(isResolutionSufficient(-1, -1)).toBe(true);
  });

  it("fails open on a non-finite reading", () => {
    expect(isResolutionSufficient(Number.NaN, 720)).toBe(true);
    expect(isResolutionSufficient(1280, Number.POSITIVE_INFINITY)).toBe(true);
  });
});
