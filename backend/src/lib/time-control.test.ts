/**
 * Unit tests for live exam time control (#8).
 *
 * {@link computeAdjustedEndTime} is pure, so it's tested directly. The
 * {@link applyTimeChange} orchestration takes its DB work via {@link TimeChangeDeps},
 * so here those are replaced with spy fakes — no DB — mirroring the injectable-deps
 * pattern in `proctor-actions.test.ts`. The tests assert that each affected session
 * is shifted by the delta, the clamp-at-now rule holds, the persisted updates match
 * the returned results, and an empty match set is a clean no-op.
 */

import { describe, it, expect, mock } from "bun:test";
import type { BroadcastTarget } from "@azhura/shared";
import {
  applyTimeChange,
  computeAdjustedEndTime,
  type TimeChangeDeps,
  type TimeChangeSession,
} from "./time-control";

const NOW = 1_000_000;

function makeDeps(
  sessions: TimeChangeSession[],
  overrides: Partial<TimeChangeDeps> = {}
): TimeChangeDeps {
  return {
    loadActiveSessions: mock(async () => sessions),
    persistEndTimes: mock(async () => {}),
    now: () => NOW,
    ...overrides,
  };
}

describe("computeAdjustedEndTime", () => {
  it("adds positive delta to the end time", () => {
    expect(computeAdjustedEndTime(NOW + 60_000, 5 * 60_000, NOW)).toBe(NOW + 360_000);
  });

  it("subtracts negative delta from the end time", () => {
    expect(computeAdjustedEndTime(NOW + 600_000, -5 * 60_000, NOW)).toBe(NOW + 300_000);
  });

  it("clamps to now when subtracting more than the remaining time", () => {
    // 2 min remaining, subtract 10 min → ends immediately (remaining 0), never past.
    expect(computeAdjustedEndTime(NOW + 120_000, -10 * 60_000, NOW)).toBe(NOW);
  });

  it("clamps to now for an exactly-zero result, not below", () => {
    expect(computeAdjustedEndTime(NOW + 120_000, -120_000, NOW)).toBe(NOW);
  });
});

describe("applyTimeChange", () => {
  const target: BroadcastTarget = { type: "all" };

  it("shifts every matched session and returns the new end times", async () => {
    const sessions: TimeChangeSession[] = [
      { sessionId: "s1", userId: "u1", examId: "e1", endTime: NOW + 600_000 },
      { sessionId: "s2", userId: "u2", examId: "e1", endTime: NOW + 300_000 },
    ];
    const deps = makeDeps(sessions);

    const results = await applyTimeChange(target, 5 * 60_000, deps);

    expect(results).toEqual([
      { userId: "u1", examId: "e1", endTime: NOW + 900_000 },
      { userId: "u2", examId: "e1", endTime: NOW + 600_000 },
    ]);
  });

  it("persists exactly the new end times it returns", async () => {
    const sessions: TimeChangeSession[] = [
      { sessionId: "s1", userId: "u1", examId: "e1", endTime: NOW + 600_000 },
    ];
    const persistEndTimes = mock(async () => {});
    const deps = makeDeps(sessions, { persistEndTimes });

    await applyTimeChange(target, -2 * 60_000, deps);

    expect(persistEndTimes).toHaveBeenCalledWith([{ sessionId: "s1", endTime: NOW + 480_000 }]);
  });

  it("clamps a large subtraction to now per session", async () => {
    const sessions: TimeChangeSession[] = [
      { sessionId: "s1", userId: "u1", examId: "e1", endTime: NOW + 60_000 },
    ];
    const deps = makeDeps(sessions);

    const results = await applyTimeChange(target, -30 * 60_000, deps);

    expect(results).toEqual([{ userId: "u1", examId: "e1", endTime: NOW }]);
  });

  it("is a clean no-op when no active session matches the target", async () => {
    const persistEndTimes = mock(async () => {});
    const deps = makeDeps([], { persistEndTimes });

    const results = await applyTimeChange({ type: "user", userId: "ghost" }, 5 * 60_000, deps);

    expect(results).toEqual([]);
    expect(persistEndTimes).toHaveBeenCalledWith([]);
  });
});
