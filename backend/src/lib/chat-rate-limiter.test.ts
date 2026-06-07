/**
 * Unit tests for the chat anti-spam rate limiter (#17).
 *
 * Pure logic with an injected clock — no timers. Verifies the within-window
 * allowance, the overflow→mute transition, mute expiry/recovery, and per-user
 * isolation.
 */

import { describe, it, expect } from "bun:test";
import { createChatRateLimiter } from "./chat-rate-limiter";

const OPTS = { windowMs: 5000, maxInWindow: 5, muteMs: 60000 };

describe("createChatRateLimiter", () => {
  it("allows messages up to the window limit", () => {
    const limiter = createChatRateLimiter(OPTS);
    for (let i = 0; i < 5; i++) {
      expect(limiter.check("u1", 1000 + i).allowed).toBe(true);
    }
  });

  it("mutes on the message that exceeds the limit", () => {
    const limiter = createChatRateLimiter(OPTS);
    for (let i = 0; i < 5; i++) limiter.check("u1", 1000);
    const sixth = limiter.check("u1", 1000);
    expect(sixth.allowed).toBe(false);
    expect(sixth.mutedUntil).toBe(1000 + OPTS.muteMs);
  });

  it("keeps rejecting while the mute is active", () => {
    const limiter = createChatRateLimiter(OPTS);
    for (let i = 0; i < 6; i++) limiter.check("u1", 1000);
    // Mid-mute attempt is still rejected, no new mute window started.
    expect(limiter.check("u1", 1000 + 30000).allowed).toBe(false);
  });

  it("allows again once the mute has expired", () => {
    const limiter = createChatRateLimiter(OPTS);
    for (let i = 0; i < 6; i++) limiter.check("u1", 1000);
    const mutedUntil = 1000 + OPTS.muteMs;
    expect(limiter.check("u1", mutedUntil + 1).allowed).toBe(true);
  });

  it("slides the window — old messages age out", () => {
    const limiter = createChatRateLimiter(OPTS);
    // 5 messages at t=1000, then one past the 5s window — the originals expired.
    for (let i = 0; i < 5; i++) limiter.check("u1", 1000);
    expect(limiter.check("u1", 1000 + OPTS.windowMs + 1).allowed).toBe(true);
  });

  it("tracks users independently", () => {
    const limiter = createChatRateLimiter(OPTS);
    for (let i = 0; i < 6; i++) limiter.check("u1", 1000);
    // u1 is muted; u2 is unaffected.
    expect(limiter.check("u1", 1000).allowed).toBe(false);
    expect(limiter.check("u2", 1000).allowed).toBe(true);
  });

  it("clear() resets a user's state", () => {
    const limiter = createChatRateLimiter(OPTS);
    for (let i = 0; i < 6; i++) limiter.check("u1", 1000);
    limiter.clear("u1");
    expect(limiter.check("u1", 1000).allowed).toBe(true);
  });
});
