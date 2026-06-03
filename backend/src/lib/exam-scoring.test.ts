/**
 * Unit tests for the pure grading function (#4 resume-session).
 *
 * `gradeAgainstKey` is the single source of scoring truth, shared by manual
 * submit and lazy finalization of an expired session, so it must count
 * correct/wrong/empty answers and round the percentage identically for both.
 * The DB-bound helpers (`findActiveSession`, `finalizeSession`) need a live
 * database and are covered by E2E.
 */

import { describe, it, expect } from "bun:test";
import { gradeAgainstKey, type AnswerKeyEntry } from "./exam-scoring";

const key: AnswerKeyEntry[] = [
  { id: "q1", correctOptionId: "q1-b" },
  { id: "q2", correctOptionId: "q2-a" },
  { id: "q3", correctOptionId: "q3-d" },
  { id: "q4", correctOptionId: "q4-c" },
];

describe("gradeAgainstKey", () => {
  it("scores 100 when every answer is correct", () => {
    const selected = new Map<string, string | null>([
      ["q1", "q1-b"],
      ["q2", "q2-a"],
      ["q3", "q3-d"],
      ["q4", "q4-c"],
    ]);

    expect(gradeAgainstKey(key, selected)).toEqual({
      score: 100,
      totalCorrect: 4,
      totalWrong: 0,
      totalEmpty: 0,
    });
  });

  it("counts correct, wrong, and empty and rounds the percentage", () => {
    // 2 correct of 4 → 50; one wrong, one unanswered.
    const selected = new Map<string, string | null>([
      ["q1", "q1-b"], // correct
      ["q2", "q2-x"], // wrong
      ["q3", "q3-d"], // correct
      ["q4", null], // empty
    ]);

    expect(gradeAgainstKey(key, selected)).toEqual({
      score: 50,
      totalCorrect: 2,
      totalWrong: 1,
      totalEmpty: 1,
    });
  });

  it("treats a missing map entry as empty (not wrong)", () => {
    // Only q1 answered; q2–q4 absent from the map entirely.
    const selected = new Map<string, string | null>([["q1", "q1-b"]]);

    expect(gradeAgainstKey(key, selected)).toEqual({
      score: 25,
      totalCorrect: 1,
      totalWrong: 0,
      totalEmpty: 3,
    });
  });

  it("rounds a non-terminating percentage to the nearest integer", () => {
    // 1 correct of 3 → 33.33% → 33.
    const threeKey: AnswerKeyEntry[] = [
      { id: "q1", correctOptionId: "q1-a" },
      { id: "q2", correctOptionId: "q2-a" },
      { id: "q3", correctOptionId: "q3-a" },
    ];
    const selected = new Map<string, string | null>([
      ["q1", "q1-a"],
      ["q2", "q2-z"],
      ["q3", null],
    ]);

    expect(gradeAgainstKey(threeKey, selected).score).toBe(33);
  });

  it("returns score 0 for an empty key (no division by zero)", () => {
    expect(gradeAgainstKey([], new Map())).toEqual({
      score: 0,
      totalCorrect: 0,
      totalWrong: 0,
      totalEmpty: 0,
    });
  });
});
