/**
 * Unit tests for the batch answer normalizer (#10 autosave).
 *
 * The DB enforces idempotency; this helper only collapses intra-batch
 * duplicates so a single flush never writes the same question twice. We verify
 * the "latest timestamp wins" and "stable order" guarantees in isolation.
 */

import { describe, it, expect } from "bun:test";
import { dedupeAnswersByQuestion, type RawBatchAnswer } from "./answer-batch";

// `dedupeAnswersByQuestion` normalizes every row to carry an explicit
// `answerValue` (null when absent), so the expected objects must include it too.
const answer = (
  questionId: string,
  selectedOptionId: string | null,
  timestamp: number,
  answerValue: string | null = null
): RawBatchAnswer => ({ questionId, selectedOptionId, answerValue, timestamp });

describe("dedupeAnswersByQuestion", () => {
  it("returns an empty array unchanged", () => {
    expect(dedupeAnswersByQuestion([])).toEqual([]);
  });

  it("passes through a batch that has no duplicate questions", () => {
    const batch = [answer("q1", "o1", 100), answer("q2", "o2", 200)];
    expect(dedupeAnswersByQuestion(batch)).toEqual(batch);
  });

  it("keeps the most recent answer per question (latest timestamp wins)", () => {
    const result = dedupeAnswersByQuestion([
      answer("q1", "o1", 100),
      answer("q1", "o2", 300),
      answer("q1", "o3", 200),
    ]);
    expect(result).toEqual([answer("q1", "o2", 300)]);
  });

  it("resolves a timestamp tie in favour of the later-listed entry", () => {
    const result = dedupeAnswersByQuestion([
      answer("q1", "o1", 500),
      answer("q1", "o2", 500),
    ]);
    expect(result).toEqual([answer("q1", "o2", 500)]);
  });

  it("preserves first-appearance order across multiple questions", () => {
    const result = dedupeAnswersByQuestion([
      answer("q2", "a", 10),
      answer("q1", "b", 10),
      answer("q2", "c", 20), // updates q2 but must not reorder it after q1
    ]);
    expect(result.map((a) => a.questionId)).toEqual(["q2", "q1"]);
    expect(result[0]).toEqual(answer("q2", "c", 20));
  });

  it("coerces an undefined selectedOptionId to null", () => {
    const result = dedupeAnswersByQuestion([
      { questionId: "q1", timestamp: 100 } as unknown as RawBatchAnswer,
    ]);
    expect(result[0].selectedOptionId).toBeNull();
  });

  it("does not mutate the input array", () => {
    const batch = [answer("q1", "o1", 100), answer("q1", "o2", 200)];
    const snapshot = JSON.parse(JSON.stringify(batch));
    dedupeAnswersByQuestion(batch);
    expect(batch).toEqual(snapshot);
  });
});
