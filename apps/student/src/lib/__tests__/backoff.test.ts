import { describe, it, expect } from "vitest";
import { nextBackoffDelay } from "../backoff";

describe("nextBackoffDelay", () => {
  it("returns the base delay for the first attempt", () => {
    expect(nextBackoffDelay(0, { baseMs: 2000, capMs: 30000, factor: 2 })).toBe(2000);
  });

  it("grows exponentially by the factor", () => {
    const opts = { baseMs: 2000, capMs: 30000, factor: 2 };
    expect(nextBackoffDelay(1, opts)).toBe(4000);
    expect(nextBackoffDelay(2, opts)).toBe(8000);
    expect(nextBackoffDelay(3, opts)).toBe(16000);
  });

  it("never exceeds the cap", () => {
    const opts = { baseMs: 2000, capMs: 30000, factor: 2 };
    expect(nextBackoffDelay(4, opts)).toBe(30000); // 32000 -> capped
    expect(nextBackoffDelay(50, opts)).toBe(30000);
  });

  it("clamps negative attempts to the base delay", () => {
    expect(nextBackoffDelay(-5, { baseMs: 2000 })).toBe(2000);
  });

  it("applies sensible defaults when no options are given", () => {
    expect(nextBackoffDelay(0)).toBe(2000);
    expect(nextBackoffDelay(100)).toBe(30000);
  });
});
