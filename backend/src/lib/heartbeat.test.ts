/**
 * Unit tests for the app-level heartbeat tracker (#9).
 *
 * The tracker is the side-effect-free core that decides *when* a peer has
 * missed enough pongs to be treated as dead. socket.ts wires it to the ping
 * interval and the `heartbeat:pong` event; here we verify the miss-counting
 * and reset semantics in isolation.
 */

import { describe, it, expect } from "bun:test";
import { createHeartbeatTracker } from "./heartbeat";

describe("createHeartbeatTracker", () => {
  it("does not flatline a healthy peer that always pongs", () => {
    const tracker = createHeartbeatTracker({ maxMisses: 2 });
    for (let round = 0; round < 100; round += 1) {
      expect(tracker.recordPing()).toBe(false);
      tracker.recordPong();
      expect(tracker.misses).toBe(0);
    }
  });

  it("does not count the first outstanding ping as a miss", () => {
    // One ping with no pong yet is normal in-flight, not a miss.
    const tracker = createHeartbeatTracker({ maxMisses: 2 });
    expect(tracker.recordPing()).toBe(false);
    expect(tracker.misses).toBe(0);
  });

  it("flatlines after maxMisses consecutive unanswered pings", () => {
    const tracker = createHeartbeatTracker({ maxMisses: 2 });
    expect(tracker.recordPing()).toBe(false); // ping #1, in-flight
    expect(tracker.recordPing()).toBe(false); // ping #2, miss #1
    expect(tracker.misses).toBe(1);
    expect(tracker.recordPing()).toBe(true); // ping #3, miss #2 → dead
    expect(tracker.misses).toBe(2);
  });

  it("treats maxMisses=1 as flatline on the first truly missed pong", () => {
    const tracker = createHeartbeatTracker({ maxMisses: 1 });
    expect(tracker.recordPing()).toBe(false); // in-flight, not yet a miss
    expect(tracker.recordPing()).toBe(true); // second unanswered ping → dead
  });

  it("resets the miss streak when a pong arrives", () => {
    const tracker = createHeartbeatTracker({ maxMisses: 3 });
    tracker.recordPing();
    tracker.recordPing(); // miss #1
    expect(tracker.misses).toBe(1);
    tracker.recordPong();
    expect(tracker.misses).toBe(0);
    // After recovery it takes the full streak again to flatline.
    expect(tracker.recordPing()).toBe(false);
    expect(tracker.recordPing()).toBe(false);
    expect(tracker.recordPing()).toBe(false);
    expect(tracker.misses).toBe(2);
  });

  it("clamps a non-positive or fractional maxMisses to a sane floor of 1", () => {
    const zero = createHeartbeatTracker({ maxMisses: 0 });
    expect(zero.recordPing()).toBe(false);
    expect(zero.recordPing()).toBe(true);

    const fractional = createHeartbeatTracker({ maxMisses: 2.9 });
    expect(fractional.recordPing()).toBe(false); // in-flight
    expect(fractional.recordPing()).toBe(false); // miss #1
    expect(fractional.recordPing()).toBe(true); // miss #2 (floored to 2)
  });
});
