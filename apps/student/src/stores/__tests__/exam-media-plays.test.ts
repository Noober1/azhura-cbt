import { describe, it, expect, beforeEach } from "vitest";
import { useExamStore } from "../exam";

/**
 * #164 — play-count persistence. These cover the in-memory accounting and reset
 * semantics in a Node environment; the localStorage mirror (browser-only) and
 * the player UI are exercised by manual/E2E per the app's testing approach.
 */
describe("exam store — media play counts (#164)", () => {
  beforeEach(() => {
    useExamStore.getState().resetExam();
  });

  it("increments the count for a key on each recorded play", () => {
    const { recordMediaPlay } = useExamStore.getState();
    recordMediaPlay("q1:/uploads/audio/a.mp3");
    recordMediaPlay("q1:/uploads/audio/a.mp3");
    expect(useExamStore.getState().mediaPlays["q1:/uploads/audio/a.mp3"]).toBe(2);
  });

  it("tracks clips independently by key", () => {
    const { recordMediaPlay } = useExamStore.getState();
    recordMediaPlay("q1:a.mp3");
    recordMediaPlay("q2:b.mp3");
    recordMediaPlay("q2:b.mp3");
    const plays = useExamStore.getState().mediaPlays;
    expect(plays["q1:a.mp3"]).toBe(1);
    expect(plays["q2:b.mp3"]).toBe(2);
  });

  it("clears all counts on resetExam (fresh attempt starts with full budgets)", () => {
    useExamStore.getState().recordMediaPlay("q1:a.mp3");
    useExamStore.getState().resetExam();
    expect(useExamStore.getState().mediaPlays).toEqual({});
  });
});
