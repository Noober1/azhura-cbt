/**
 * Unit tests for the active-session registry (#5: single active session).
 *
 * Backed by `ioredis-mock` so the atomic Lua compare-and-set logic is exercised
 * without a live Redis/Valkey server. Verifies the claim guard, WS-liveness
 * binding, heartbeat/grace TTL refresh, and owner-scoped release.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import RedisMock from "ioredis-mock";
import type { Redis } from "ioredis";
import {
  createSessionRegistry,
  type SessionRegistry,
  PENDING_TTL,
  CONNECTED_TTL,
  GRACE_TTL,
} from "./session-registry";

const USER = "user-1";
const SESSION_A = "session-a";
const SESSION_B = "session-b";
const keyFor = (userId: string) => `session:active:${userId}`;

// ioredis-mock shares one in-memory store across instances, so reuse a single
// client and flush it between tests to keep each case isolated.
const client = new RedisMock() as unknown as Redis;
const registry: SessionRegistry = createSessionRegistry(client);

beforeEach(async () => {
  await client.flushall();
});

describe("tryClaim", () => {
  it("claims an account when no session is alive", async () => {
    expect(await registry.tryClaim(USER, SESSION_A)).toBe(true);
  });

  it("rejects a second login while the first session is alive", async () => {
    await registry.tryClaim(USER, SESSION_A);
    expect(await registry.tryClaim(USER, SESSION_B)).toBe(false);
  });

  it("sets the pending TTL on a fresh claim", async () => {
    await registry.tryClaim(USER, SESSION_A);
    const ttl = await client.ttl(keyFor(USER));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(PENDING_TTL);
  });

  it("allows re-claiming once the session is gone (TTL elapsed / released)", async () => {
    await registry.tryClaim(USER, SESSION_A);
    await client.del(keyFor(USER)); // simulate TTL expiry
    expect(await registry.tryClaim(USER, SESSION_B)).toBe(true);
  });
});

describe("markConnected", () => {
  it("binds the live socket and refreshes to the connected TTL on match", async () => {
    await registry.tryClaim(USER, SESSION_A);
    expect(await registry.markConnected(USER, SESSION_A, "socket-1")).toBe(true);

    const active = await registry.getActive(USER);
    expect(active?.status).toBe("connected");
    expect(active?.socketId).toBe("socket-1");

    const ttl = await client.ttl(keyFor(USER));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(CONNECTED_TTL);
  });

  it("rejects and does not clobber when the sessionId does not match", async () => {
    await registry.tryClaim(USER, SESSION_A);
    expect(await registry.markConnected(USER, SESSION_B, "socket-x")).toBe(false);

    const active = await registry.getActive(USER);
    expect(active?.sessionId).toBe(SESSION_A);
    expect(active?.status).toBe("pending");
  });

  it("rejects when no session exists", async () => {
    expect(await registry.markConnected(USER, SESSION_A, "socket-1")).toBe(false);
  });
});

describe("refresh (heartbeat)", () => {
  it("extends the TTL only for the owning session", async () => {
    await registry.tryClaim(USER, SESSION_A);
    expect(await registry.refresh(USER, SESSION_A)).toBe(true);
    expect(await registry.refresh(USER, SESSION_B)).toBe(false);

    const ttl = await client.ttl(keyFor(USER));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(CONNECTED_TTL);
  });

  it("advances lastSeen on each refresh (roster freshness, #7)", async () => {
    await registry.tryClaim(USER, SESSION_A);
    await registry.markConnected(USER, SESSION_A, "socket-1");
    const before = Number((await registry.getActive(USER))?.lastSeen);

    // Wait a tick so the timestamp is guaranteed to differ.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await registry.refresh(USER, SESSION_A)).toBe(true);

    const after = Number((await registry.getActive(USER))?.lastSeen);
    expect(after).toBeGreaterThan(before);
  });

  it("does not change lastSeen for a non-owning refresh", async () => {
    await registry.tryClaim(USER, SESSION_A);
    await registry.markConnected(USER, SESSION_A, "socket-1");
    const before = (await registry.getActive(USER))?.lastSeen;

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await registry.refresh(USER, SESSION_B)).toBe(false);

    expect((await registry.getActive(USER))?.lastSeen).toBe(before ?? "");
  });
});

describe("startGrace (disconnect)", () => {
  it("shrinks the TTL to the grace window for the owning session", async () => {
    await registry.tryClaim(USER, SESSION_A);
    await registry.markConnected(USER, SESSION_A, "socket-1");
    expect(await registry.startGrace(USER, SESSION_A)).toBe(true);

    const ttl = await client.ttl(keyFor(USER));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(GRACE_TTL);
  });

  it("does nothing for a non-owning session", async () => {
    await registry.tryClaim(USER, SESSION_A);
    expect(await registry.startGrace(USER, SESSION_B)).toBe(false);
  });
});

describe("release (logout)", () => {
  it("deletes the entry only when the sessionId matches", async () => {
    await registry.tryClaim(USER, SESSION_A);

    expect(await registry.release(USER, SESSION_B)).toBe(false);
    expect(await registry.getActive(USER)).not.toBeNull();

    expect(await registry.release(USER, SESSION_A)).toBe(true);
    expect(await registry.getActive(USER)).toBeNull();
  });
});

describe("listActive (roster enumeration, #7)", () => {
  it("returns an empty list when no sessions are alive", async () => {
    expect(await registry.listActive()).toEqual([]);
  });

  it("enumerates every live session with its userId and status", async () => {
    await registry.tryClaim("user-a", "sess-a");
    await registry.tryClaim("user-b", "sess-b");
    await registry.markConnected("user-b", "sess-b", "socket-b");

    const active = await registry.listActive();
    expect(active.length).toBe(2);

    const byUser = new Map(active.map((e) => [e.userId, e]));
    expect(byUser.get("user-a")?.status).toBe("pending");
    expect(byUser.get("user-b")?.status).toBe("connected");
    expect(byUser.get("user-b")?.sessionId).toBe("sess-b");
  });

  it("omits a released session", async () => {
    await registry.tryClaim("user-a", "sess-a");
    await registry.release("user-a", "sess-a");
    expect(await registry.listActive()).toEqual([]);
  });
});

describe("getActive", () => {
  it("returns null when no session exists", async () => {
    expect(await registry.getActive(USER)).toBeNull();
  });

  it("returns a snapshot of the claimed session", async () => {
    await registry.tryClaim(USER, SESSION_A);
    const active = await registry.getActive(USER);
    expect(active).toMatchObject({
      sessionId: SESSION_A,
      status: "pending",
      socketId: null,
    });
  });
});
