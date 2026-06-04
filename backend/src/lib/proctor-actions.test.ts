/**
 * Unit tests for the server-authoritative kick orchestration (#11).
 *
 * {@link kickStudent} takes its I/O-heavy collaborators via {@link KickDeps}, so
 * here they are replaced with spy fakes — no DB, Redis, or socket, and no global
 * module mocking that would leak into other test files. The tests assert the
 * branching and ordering: an in-progress exam is finalized *before* the session
 * is released/kicked, a dashboard student (no active exam) skips finalization,
 * and the roster always receives a remove patch.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { kickStudent, type KickDeps } from "./proctor-actions";

const USER = "user-1";
const REASON = "Pelanggaran berulang.";

// A call log shared by the spies, to assert cross-collaborator ordering.
let calls: string[];

function makeDeps(overrides: Partial<KickDeps> = {}): KickDeps {
  return {
    findActiveSession: mock(async () => null),
    finalizeSession: mock(async () => {
      calls.push("finalize");
      return { score: 0, totalCorrect: 0, totalWrong: 0, totalEmpty: 0 };
    }),
    getActiveSession: mock(async () => null),
    releaseSession: mock(async () => {
      calls.push("release");
      return true;
    }),
    kickUser: mock(() => {
      calls.push("kick");
    }),
    notifyRosterPatch: mock(() => {
      calls.push("roster-remove");
    }),
    ...overrides,
  };
}

beforeEach(() => {
  calls = [];
});

describe("kickStudent", () => {
  it("finalizes an in-progress exam server-side, then releases and kicks", async () => {
    const deps = makeDeps({
      findActiveSession: mock(async () => ({ id: "sess-1", examId: "exam-1" })),
      getActiveSession: mock(async () => ({ sessionId: "sess-1" })),
    });

    const result = await kickStudent(USER, REASON, deps);

    expect(result.finalized).toBe(true);
    expect(deps.finalizeSession).toHaveBeenCalledTimes(1);
    expect(deps.releaseSession).toHaveBeenCalledWith(USER, "sess-1");
    expect(deps.kickUser).toHaveBeenCalledWith(USER, REASON);
    expect(deps.notifyRosterPatch).toHaveBeenCalledWith({ type: "remove", userId: USER });
    // Finalize must happen before the session is torn down so no score is lost.
    expect(calls).toEqual(["finalize", "release", "kick", "roster-remove"]);
  });

  it("skips finalization for a dashboard student with no active exam", async () => {
    const deps = makeDeps({
      findActiveSession: mock(async () => null),
      getActiveSession: mock(async () => ({ sessionId: "sess-9" })),
    });

    const result = await kickStudent(USER, REASON, deps);

    expect(result.finalized).toBe(false);
    expect(deps.finalizeSession).not.toHaveBeenCalled();
    expect(deps.releaseSession).toHaveBeenCalledWith(USER, "sess-9");
    expect(deps.kickUser).toHaveBeenCalledWith(USER, REASON);
    expect(calls).toEqual(["release", "kick", "roster-remove"]);
  });

  it("still kicks and removes when there is no registry session to release", async () => {
    const deps = makeDeps({
      findActiveSession: mock(async () => null),
      getActiveSession: mock(async () => null),
    });

    const result = await kickStudent(USER, REASON, deps);

    expect(result.finalized).toBe(false);
    expect(deps.releaseSession).not.toHaveBeenCalled();
    expect(deps.kickUser).toHaveBeenCalledWith(USER, REASON);
    expect(deps.notifyRosterPatch).toHaveBeenCalledWith({ type: "remove", userId: USER });
    expect(calls).toEqual(["kick", "roster-remove"]);
  });
});
