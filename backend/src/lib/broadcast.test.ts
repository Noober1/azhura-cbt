/**
 * Unit tests for broadcast target resolution (#13).
 *
 * `resolveBroadcast` is pure, so it is tested directly — no socket required. It
 * decides whether a message goes to every student or to a specific set of rooms.
 */

import { describe, it, expect } from "bun:test";
import { resolveBroadcast } from "./broadcast";

describe("resolveBroadcast", () => {
  it("targets all students with no specific rooms", () => {
    expect(resolveBroadcast({ type: "all" })).toEqual({ toAllStudents: true, rooms: [] });
  });

  it("targets a single user's room", () => {
    expect(resolveBroadcast({ type: "user", userId: "U1" })).toEqual({
      toAllStudents: false,
      rooms: ["user:U1"],
    });
  });

  it("targets one room per group", () => {
    expect(resolveBroadcast({ type: "group", groupIds: ["A", "B"] })).toEqual({
      toAllStudents: false,
      rooms: ["group:A", "group:B"],
    });
  });

  it("yields no rooms for an empty group list", () => {
    expect(resolveBroadcast({ type: "group", groupIds: [] })).toEqual({
      toAllStudents: false,
      rooms: [],
    });
  });
});
