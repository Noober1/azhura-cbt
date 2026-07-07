/**
 * Unit tests for the anti-cheat violation store helpers (#126).
 *
 * Pure logic only — no live DB. `insertCheatLog` is intentionally not exercised
 * here (it touches MySQL); these cover the unit-testable core: event-type
 * validation, the identity-mapping payload builder, and the burst throttle.
 */

import { describe, it, expect } from "bun:test";
import {
  parseEventType,
  buildViolationPayload,
  createBurstThrottle,
  type ViolationSocketData,
} from "./cheat-log-store";

const DATA: ViolationSocketData = {
  userId: "u-1",
  nis: "12345",
  name: "Ahmad Faisal",
  examSessionId: "exam-sess-1",
  examId: "exam-1",
};

describe("parseEventType", () => {
  it("accepts known event types", () => {
    expect(parseEventType("focus_loss")).toBe("focus_loss");
    expect(parseEventType("os_shortcut_blocked")).toBe("os_shortcut_blocked");
  });

  it("rejects unknown or non-string values", () => {
    expect(parseEventType("definitely_not_a_type")).toBeNull();
    expect(parseEventType(42)).toBeNull();
    expect(parseEventType(undefined)).toBeNull();
    expect(parseEventType(null)).toBeNull();
  });
});

describe("buildViolationPayload", () => {
  it("maps identity from socket data, not from the client event", () => {
    const before = Date.now();
    const payload = buildViolationPayload(
      DATA,
      { eventType: "focus_loss", details: "Alt+Tab", timestamp: 1000 },
      "focus_loss"
    );
    // Timestamp is server-stamped, never the client's 1000.
    expect(payload.timestamp).toBeGreaterThanOrEqual(before);
    expect(payload).toMatchObject({
      studentId: "u-1",
      nis: "12345",
      name: "Ahmad Faisal",
      sessionId: "exam-sess-1",
      examId: "exam-1",
      eventType: "focus_loss",
      details: "Alt+Tab",
    });
  });

  it("carries the server-resolved exam session id and exam id (FK-satisfying)", () => {
    const payload = buildViolationPayload(DATA, { timestamp: 1 }, "focus_loss");
    expect(payload.sessionId).toBe("exam-sess-1");
    expect(payload.examId).toBe("exam-1");
  });

  it("defaults examId to null and session to empty when not mid-exam", () => {
    const payload = buildViolationPayload(
      { userId: "u-3", nis: "111" },
      { timestamp: 1 },
      "focus_loss"
    );
    expect(payload.examId).toBeNull();
    expect(payload.sessionId).toBe("");
  });

  it("falls back to empty name and session when socket data omits them", () => {
    const payload = buildViolationPayload(
      { userId: "u-2", nis: "67890" },
      { timestamp: 5 },
      "fullscreen_exit"
    );
    expect(payload.name).toBe("");
    expect(payload.sessionId).toBe("");
  });

  it("drops empty details and defaults a missing timestamp to now", () => {
    const before = Date.now();
    const payload = buildViolationPayload(DATA, { details: "" }, "shortcut_attempt");
    expect(payload.details).toBeUndefined();
    expect(payload.timestamp).toBeGreaterThanOrEqual(before);
  });

  it("truncates over-long details", () => {
    const long = "x".repeat(1000);
    const payload = buildViolationPayload(DATA, { details: long, timestamp: 1 }, "focus_loss");
    expect(payload.details?.length).toBe(512);
  });
});

describe("createBurstThrottle", () => {
  it("allows the first fire and blocks repeats within the interval", () => {
    const t = createBurstThrottle(1000);
    expect(t.allow("k", 0)).toBe(true);
    expect(t.allow("k", 500)).toBe(false);
    expect(t.allow("k", 999)).toBe(false);
  });

  it("allows again once the interval has elapsed", () => {
    const t = createBurstThrottle(1000);
    expect(t.allow("k", 0)).toBe(true);
    expect(t.allow("k", 1000)).toBe(true);
    expect(t.allow("k", 1500)).toBe(false);
  });

  it("tracks keys independently", () => {
    const t = createBurstThrottle(1000);
    expect(t.allow("a", 0)).toBe(true);
    expect(t.allow("b", 0)).toBe(true);
    expect(t.allow("a", 100)).toBe(false);
  });

  it("reset() forgets an exact key", () => {
    const t = createBurstThrottle(1000);
    t.allow("k", 0);
    t.reset("k");
    expect(t.allow("k", 100)).toBe(true);
  });

  it("reset(socketId) clears all that socket's prefixed keys", () => {
    const t = createBurstThrottle(1000);
    t.allow("sock-1:focus_loss", 0);
    t.allow("sock-1:fullscreen_exit", 0);
    t.allow("sock-2:focus_loss", 0);
    t.reset("sock-1");
    // sock-1's keys are gone (allowed again); sock-2 untouched (still blocked).
    expect(t.allow("sock-1:focus_loss", 100)).toBe(true);
    expect(t.allow("sock-1:fullscreen_exit", 100)).toBe(true);
    expect(t.allow("sock-2:focus_loss", 100)).toBe(false);
  });
});
