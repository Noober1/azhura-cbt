/**
 * Unit tests for question-order helpers (#2 randomization).
 *
 * `shuffle` must be a pure permutation (same multiset, input untouched) and
 * `applyQuestionOrder` must respect a persisted order while staying robust to
 * questions added or removed after the session's order was generated.
 */

import { describe, it, expect } from "bun:test";
import { shuffle, applyQuestionOrder } from "./question-order";

describe("shuffle", () => {
  it("returns a new array, leaving the input untouched", () => {
    const input = ["a", "b", "c", "d"];
    const copy = [...input];
    const out = shuffle(input);

    expect(out).not.toBe(input); // new array reference
    expect(input).toEqual(copy); // input not mutated
  });

  it("preserves every element exactly once (a permutation)", () => {
    const input = ["q1", "q2", "q3", "q4", "q5"];
    const out = shuffle(input);

    expect(out.length).toBe(input.length);
    expect([...out].sort()).toEqual([...input].sort());
  });

  it("handles empty and single-element arrays", () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(["only"])).toEqual(["only"]);
  });

  it("eventually produces a different order for a large input", () => {
    // Non-flaky: with 50 elements the odds of N identical shuffles are ~0.
    const input = Array.from({ length: 50 }, (_, i) => `q${i}`);
    const reordered = Array.from({ length: 5 }, () => shuffle(input)).some(
      (out) => out.some((id, i) => id !== input[i])
    );
    expect(reordered).toBe(true);
  });
});

describe("applyQuestionOrder", () => {
  it("returns the canonical order when there is no persisted order", () => {
    const canonical = ["a", "b", "c"];
    expect(applyQuestionOrder(canonical, [])).toEqual(canonical);
  });

  it("follows the persisted order when it covers every question", () => {
    const canonical = ["a", "b", "c"];
    const persisted = ["c", "a", "b"];
    expect(applyQuestionOrder(canonical, persisted)).toEqual(["c", "a", "b"]);
  });

  it("drops persisted ids whose question no longer exists", () => {
    const canonical = ["a", "b"]; // "c" was deleted after the order was stored
    const persisted = ["c", "b", "a"];
    expect(applyQuestionOrder(canonical, persisted)).toEqual(["b", "a"]);
  });

  it("appends questions missing from the persisted order (canonical order)", () => {
    const canonical = ["a", "b", "c", "d"]; // "c" and "d" added after storage
    const persisted = ["b", "a"];
    expect(applyQuestionOrder(canonical, persisted)).toEqual(["b", "a", "c", "d"]);
  });

  it("ignores duplicate ids in the persisted order", () => {
    const canonical = ["a", "b", "c"];
    const persisted = ["b", "b", "a"];
    expect(applyQuestionOrder(canonical, persisted)).toEqual(["b", "a", "c"]);
  });
});
