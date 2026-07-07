import { describe, expect, test } from "bun:test";
import { gradeFillInBlank, gradeMatching, gradeSorting } from "./grading";

describe("gradeFillInBlank", () => {
  test("exact match returns true", () => {
    expect(gradeFillInBlank("jakarta", { answer: "jakarta" })).toBe(true);
  });
  test("case-insensitive match returns true", () => {
    expect(gradeFillInBlank("JAKARTA", { answer: "jakarta" })).toBe(true);
    expect(gradeFillInBlank("Jakarta", { answer: "JAKARTA" })).toBe(true);
  });
  test("trims whitespace", () => {
    expect(gradeFillInBlank("  jakarta  ", { answer: "jakarta" })).toBe(true);
  });
  test("wrong answer returns false", () => {
    expect(gradeFillInBlank("surabaya", { answer: "jakarta" })).toBe(false);
  });
  test("empty student answer returns false", () => {
    expect(gradeFillInBlank("", { answer: "jakarta" })).toBe(false);
  });

  // Multiple correct answers (answers field)
  test("matches first alternative answer", () => {
    expect(gradeFillInBlank("ibu kota", { answer: "jakarta", answers: ["jakarta", "ibu kota"] })).toBe(true);
  });
  test("matches second alternative answer case-insensitively", () => {
    expect(gradeFillInBlank("IBU KOTA", { answer: "jakarta", answers: ["jakarta", "ibu kota"] })).toBe(true);
  });
  test("no match in alternatives returns false", () => {
    expect(gradeFillInBlank("surabaya", { answer: "jakarta", answers: ["jakarta", "ibu kota"] })).toBe(false);
  });
  test("empty answers array falls back to answer field", () => {
    expect(gradeFillInBlank("jakarta", { answer: "jakarta", answers: [] })).toBe(true);
    expect(gradeFillInBlank("surabaya", { answer: "jakarta", answers: [] })).toBe(false);
  });
  test("answers field with whitespace is trimmed", () => {
    expect(gradeFillInBlank("ibu kota", { answer: "jakarta", answers: ["  ibu kota  "] })).toBe(true);
  });
});

// perm[k] = original pair index shown at display position k. The student
// submits [leftIndex, rightDisplayIndex]; a pair [l, k] is correct iff
// perm[k] === l. Correct submission for this perm: [[0,1],[1,3],[2,0],[3,2]].
const matchPerm = [2, 0, 3, 1];

describe("gradeMatching", () => {
  test("all correct returns true", () => {
    expect(gradeMatching([[0, 1], [1, 3], [2, 0], [3, 2]], matchPerm)).toBe(true);
  });
  test("more than 50% correct returns true", () => {
    // 3 of 4 correct (last pair wrong).
    expect(gradeMatching([[0, 1], [1, 3], [2, 0], [3, 3]], matchPerm)).toBe(true);
  });
  test("exactly 50% is not more than 50%, returns false", () => {
    // 2 of 4 = 50%, not > 50%.
    expect(gradeMatching([[0, 1], [1, 3], [2, 2], [3, 3]], matchPerm)).toBe(false);
  });
  test("SECURITY: blind identity submission no longer scores full marks", () => {
    // [[0,0],[1,1],[2,2],[3,3]] used to always win; with a non-identity perm it
    // now scores 0 (the fix for the forgeable matching answer key).
    expect(gradeMatching([[0, 0], [1, 1], [2, 2], [3, 3]], matchPerm)).toBe(false);
  });
  test("empty answer returns false", () => {
    expect(gradeMatching([], matchPerm)).toBe(false);
  });
});

// items authored in correct order → correctOrder is identity (see SortingForm).
// perm[k] = original item index shown at display position k. The student
// submits, per position j, the display index whose original index is
// correctOrder[j]. Correct submission for this perm: [1, 3, 0, 2].
const sortingConfig = { items: ["A", "B", "C", "D"], correctOrder: [0, 1, 2, 3] };
const sortPerm = [2, 0, 3, 1];

describe("gradeSorting", () => {
  test("exact correct arrangement returns true", () => {
    expect(gradeSorting([1, 3, 0, 2], sortingConfig, sortPerm)).toBe(true);
  });
  test("more than 50% correct returns true", () => {
    // 3 of 4 positions correct.
    expect(gradeSorting([1, 3, 0, 0], sortingConfig, sortPerm)).toBe(true);
  });
  test("exactly 50% not more than 50%, returns false", () => {
    // positions 0,1 correct; 2,3 swapped → 2 of 4 = 50%.
    expect(gradeSorting([1, 3, 2, 0], sortingConfig, sortPerm)).toBe(false);
  });
  test("SECURITY: blind ascending submission no longer scores full marks", () => {
    // [0,1,2,3] used to always win; with a non-identity perm it now scores 0.
    expect(gradeSorting([0, 1, 2, 3], sortingConfig, sortPerm)).toBe(false);
  });
  test("wrong length returns false", () => {
    expect(gradeSorting([1, 0], sortingConfig, sortPerm)).toBe(false);
  });
  test("empty answer returns false", () => {
    expect(gradeSorting([], sortingConfig, sortPerm)).toBe(false);
  });
});
