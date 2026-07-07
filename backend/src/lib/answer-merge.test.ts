import { describe, expect, it } from "bun:test";
import { isEmptyAnswer, mergeAnswer } from "./answer-merge";

describe("isEmptyAnswer", () => {
  it("treats undefined/null as empty", () => {
    expect(isEmptyAnswer(undefined)).toBe(true);
    expect(isEmptyAnswer(null)).toBe(true);
  });

  it("treats an answer with neither option nor value as empty", () => {
    expect(isEmptyAnswer({ selectedOptionId: null, answerValue: null })).toBe(true);
  });

  it("treats a selected option or a value as non-empty", () => {
    expect(isEmptyAnswer({ selectedOptionId: "opt-1" })).toBe(false);
    expect(isEmptyAnswer({ answerValue: "jawaban" })).toBe(false);
  });
});

describe("mergeAnswer", () => {
  it("keeps the stored answer when the client omits the question (no null wipe)", () => {
    const stored = { selectedOptionId: "opt-A", answerValue: null };
    const merged = mergeAnswer(undefined, stored);
    expect(merged.effective).toEqual(stored);
    expect(merged.toPersist).toBeNull();
  });

  it("keeps the stored answer when the client sends an empty answer", () => {
    const stored = { selectedOptionId: null, answerValue: "esai lama" };
    const merged = mergeAnswer(
      { questionId: "q1", selectedOptionId: null, answerValue: null },
      stored
    );
    expect(merged.effective).toEqual(stored);
    expect(merged.toPersist).toBeNull();
  });

  it("uses and persists a fresh client answer over the stored one", () => {
    const stored = { selectedOptionId: "opt-A", answerValue: null };
    const fresh = { questionId: "q1", selectedOptionId: "opt-B", answerValue: null };
    const merged = mergeAnswer(fresh, stored);
    expect(merged.effective.selectedOptionId).toBe("opt-B");
    expect(merged.toPersist).toBe(fresh);
  });

  it("handles no stored and no submitted (empty both)", () => {
    const merged = mergeAnswer(undefined, undefined);
    expect(merged.effective).toEqual({ selectedOptionId: null, answerValue: null });
    expect(merged.toPersist).toBeNull();
  });
});
