/**
 * Unit tests for the client error-report anti-spam rate limiter (#169).
 *
 * Pure logic with an injected clock — no timers. Verifies the within-window
 * allowance, the overflow→drop transition, window sliding, and per-actor
 * isolation.
 */

import { describe, it, expect } from "bun:test";
import { createErrorReportRateLimiter } from "./error-report-rate-limiter";

const OPTS = { windowMs: 60_000, maxInWindow: 5 };

describe("createErrorReportRateLimiter", () => {
  it("allows reports up to the window limit", () => {
    const limiter = createErrorReportRateLimiter(OPTS);
    for (let i = 0; i < 5; i++) {
      expect(limiter.check("u1", 1000 + i).allowed).toBe(true);
    }
  });

  it("drops the report that exceeds the limit", () => {
    const limiter = createErrorReportRateLimiter(OPTS);
    for (let i = 0; i < 5; i++) limiter.check("u1", 1000);
    expect(limiter.check("u1", 1000).allowed).toBe(false);
  });

  it("keeps dropping while the window stays full", () => {
    const limiter = createErrorReportRateLimiter(OPTS);
    for (let i = 0; i < 6; i++) limiter.check("u1", 1000);
    // Still inside the window — overflow attempts remain dropped.
    expect(limiter.check("u1", 1000 + 30_000).allowed).toBe(false);
  });

  it("slides the window — old reports age out", () => {
    const limiter = createErrorReportRateLimiter(OPTS);
    for (let i = 0; i < 5; i++) limiter.check("u1", 1000);
    // Past the window: the originals expired, so a fresh report is allowed.
    expect(limiter.check("u1", 1000 + OPTS.windowMs + 1).allowed).toBe(true);
  });

  it("tracks actors independently", () => {
    const limiter = createErrorReportRateLimiter(OPTS);
    for (let i = 0; i < 6; i++) limiter.check("u1", 1000);
    expect(limiter.check("u1", 1000).allowed).toBe(false);
    expect(limiter.check("u2", 1000).allowed).toBe(true);
  });

  it("clear() resets an actor's state", () => {
    const limiter = createErrorReportRateLimiter(OPTS);
    for (let i = 0; i < 6; i++) limiter.check("u1", 1000);
    limiter.clear("u1");
    expect(limiter.check("u1", 1000).allowed).toBe(true);
  });
});
