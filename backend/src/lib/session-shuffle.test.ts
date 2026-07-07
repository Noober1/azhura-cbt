import { describe, expect, test } from "bun:test";
import { sessionPermutation } from "./session-shuffle";
import { gradeMatching, gradeSorting } from "./grading";

const SECRET = "test-secret-key-at-least-32-characters-long!!";

describe("sessionPermutation", () => {
  test("is a valid permutation of [0, n)", () => {
    const perm = sessionPermutation("sess-1", "q-1", 6, SECRET);
    expect([...perm].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("is deterministic for the same (session, question, secret)", () => {
    const a = sessionPermutation("sess-1", "q-1", 8, SECRET);
    const b = sessionPermutation("sess-1", "q-1", 8, SECRET);
    expect(a).toEqual(b);
  });

  test("differs across sessions and across questions", () => {
    const base = sessionPermutation("sess-1", "q-1", 8, SECRET);
    expect(sessionPermutation("sess-2", "q-1", 8, SECRET)).not.toEqual(base);
    expect(sessionPermutation("sess-1", "q-2", 8, SECRET)).not.toEqual(base);
  });

  test("depends on the secret (client cannot reproduce it without the key)", () => {
    const withKey = sessionPermutation("sess-1", "q-1", 8, SECRET);
    const otherKey = sessionPermutation("sess-1", "q-1", 8, "a-completely-different-secret-value-here!!");
    expect(withKey).not.toEqual(otherKey);
  });

  test("identity for n < 2", () => {
    expect(sessionPermutation("s", "q", 0, SECRET)).toEqual([]);
    expect(sessionPermutation("s", "q", 1, SECRET)).toEqual([0]);
  });

  test("round-trips: a correct matching arrangement scores full marks", () => {
    const n = 5;
    const perm = sessionPermutation("sess-x", "q-x", n, SECRET);
    // Correct: left l pairs with the display index k where perm[k] === l.
    const correct = Array.from({ length: n }, (_, l) => {
      const k = perm.indexOf(l);
      return [l, k] as [number, number];
    });
    expect(gradeMatching(correct, perm)).toBe(true);
  });

  test("round-trips: a correct sorting arrangement scores full marks", () => {
    const n = 5;
    const perm = sessionPermutation("sess-y", "q-y", n, SECRET);
    const correctOrder = Array.from({ length: n }, (_, i) => i);
    // Correct: position j holds the display index whose original index is j.
    const correct = correctOrder.map((orig) => perm.indexOf(orig));
    expect(gradeSorting(correct, { items: ["a", "b", "c", "d", "e"], correctOrder }, perm)).toBe(true);
  });
});
