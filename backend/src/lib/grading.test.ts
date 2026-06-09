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
});

const pairs = [
  { left: "Indonesia", right: "Jakarta" },
  { left: "Japan", right: "Tokyo" },
  { left: "France", right: "Paris" },
  { left: "Germany", right: "Berlin" },
];

describe("gradeMatching", () => {
  test("all correct returns true", () => {
    expect(gradeMatching([[0, 0], [1, 1], [2, 2], [3, 3]], { pairs })).toBe(true);
  });
  test("more than 50% correct returns true", () => {
    // 3 out of 4 correct = 75%
    expect(gradeMatching([[0, 0], [1, 1], [2, 2], [3, 0]], { pairs })).toBe(true);
  });
  test("exactly 50% is not more than 50%, returns false", () => {
    // 2 out of 4 = 50%, not > 50%
    expect(gradeMatching([[0, 0], [1, 1], [2, 3], [3, 2]], { pairs })).toBe(false);
  });
  test("all wrong returns false", () => {
    expect(gradeMatching([[0, 1], [1, 2], [2, 3], [3, 0]], { pairs })).toBe(false);
  });
  test("empty answer returns false", () => {
    expect(gradeMatching([], { pairs })).toBe(false);
  });
});

const sortingConfig = { items: ["A", "B", "C", "D"], correctOrder: [1, 0, 2, 3] };

describe("gradeSorting", () => {
  test("exact correct order returns true", () => {
    expect(gradeSorting([1, 0, 2, 3], sortingConfig)).toBe(true);
  });
  test("more than 50% correct returns true", () => {
    // 3 out of 4 = 75%
    expect(gradeSorting([1, 0, 2, 0], sortingConfig)).toBe(true);
  });
  test("exactly 50% not more than 50%, returns false", () => {
    // 2 out of 4 = 50%
    expect(gradeSorting([1, 0, 3, 2], sortingConfig)).toBe(false);
  });
  test("all wrong returns false", () => {
    expect(gradeSorting([0, 1, 3, 2], sortingConfig)).toBe(false);
  });
  test("wrong length returns false", () => {
    expect(gradeSorting([1, 0], sortingConfig)).toBe(false);
  });
  test("empty answer returns false", () => {
    expect(gradeSorting([], sortingConfig)).toBe(false);
  });
});
