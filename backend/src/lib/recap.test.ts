/**
 * Azhura CBT Backend — Recap Helper Unit Tests (#19)
 *
 * Pure unit tests for the scoring/statistics helpers in `recap.ts`. No DB or
 * HTTP needed — these cover the grading math and aggregate stats, which is where
 * the correctness risk lives. DB-touching integration of `getExamRecap`/
 * `getStudentRecap` is left to manual/E2E coverage (see project memory on the
 * backend test env: `bun test` requires live DB credentials).
 */

import { describe, it, expect } from "bun:test";
import { scoreFromCounts, computeRecapStats } from "./recap";

describe("recap: scoreFromCounts", () => {
  it("returns the rounded percentage of correct answers", () => {
    expect(scoreFromCounts(8, 10)).toBe(80);
    expect(scoreFromCounts(10, 10)).toBe(100);
    expect(scoreFromCounts(0, 10)).toBe(0);
  });

  it("rounds to the nearest integer (matches gradeAgainstKey)", () => {
    // 1/3 = 33.33% → 33
    expect(scoreFromCounts(1, 3)).toBe(33);
    // 2/3 = 66.66% → 67
    expect(scoreFromCounts(2, 3)).toBe(67);
    // 1/8 = 12.5% → 13 (round-half-up)
    expect(scoreFromCounts(1, 8)).toBe(13);
  });

  it("returns 0 for an exam with no questions (no division by zero)", () => {
    expect(scoreFromCounts(0, 0)).toBe(0);
    expect(scoreFromCounts(5, 0)).toBe(0);
  });
});

describe("recap: computeRecapStats", () => {
  it("returns all-null stats for an empty set", () => {
    expect(computeRecapStats([])).toEqual({
      average: null,
      highest: null,
      lowest: null,
      completedCount: 0,
    });
  });

  it("computes average (rounded), highest, lowest, and count", () => {
    expect(computeRecapStats([80, 90, 100])).toEqual({
      average: 90,
      highest: 100,
      lowest: 80,
      completedCount: 3,
    });
  });

  it("rounds the average to the nearest integer", () => {
    // (70 + 80 + 81) / 3 = 77 → 77
    expect(computeRecapStats([70, 80, 81]).average).toBe(77);
    // (50 + 51) / 2 = 50.5 → 51
    expect(computeRecapStats([50, 51]).average).toBe(51);
  });

  it("handles a single score", () => {
    expect(computeRecapStats([42])).toEqual({
      average: 42,
      highest: 42,
      lowest: 42,
      completedCount: 1,
    });
  });

  it("handles all-zero scores without treating them as empty", () => {
    expect(computeRecapStats([0, 0])).toEqual({
      average: 0,
      highest: 0,
      lowest: 0,
      completedCount: 2,
    });
  });
});
