/**
 * Unit tests for the roster liveness mapping (#7).
 *
 * The DB-backed snapshot query reuses the trusted active-participant join (#29);
 * the testable logic in isolation is how a Redis registry entry maps to the
 * roster's `connection` / `lastSeen` fields, covered here.
 */

import { describe, it, expect } from "bun:test";
import { toLiveness } from "./roster-liveness";
import type { ActiveSession } from "./session-registry";

const entry = (over: Partial<ActiveSession>): ActiveSession => ({
  sessionId: "s-1",
  status: "connected",
  socketId: "socket-1",
  lastSeen: "1700000000000",
  ...over,
});

describe("toLiveness", () => {
  it("reports disconnected with null lastSeen when no entry exists", () => {
    expect(toLiveness(null)).toEqual({ connection: "disconnected", lastSeen: null });
  });

  it("maps a connected entry to connected with a numeric lastSeen", () => {
    expect(toLiveness(entry({ status: "connected", lastSeen: "1700000000000" }))).toEqual({
      connection: "connected",
      lastSeen: 1700000000000,
    });
  });

  it("maps a pending entry to pending", () => {
    expect(toLiveness(entry({ status: "pending" })).connection).toBe("pending");
  });

  it("normalizes a missing/non-numeric lastSeen to null", () => {
    expect(toLiveness(entry({ lastSeen: "" })).lastSeen).toBeNull();
    expect(toLiveness(entry({ lastSeen: "abc" })).lastSeen).toBeNull();
    expect(toLiveness(entry({ lastSeen: "0" })).lastSeen).toBeNull();
  });
});
