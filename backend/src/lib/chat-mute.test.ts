/**
 * Unit tests for the chat manual-mute registry (#17).
 *
 * Backed by `ioredis-mock` so timed vs indefinite mutes, lookup, expiry, and
 * enumeration are exercised without a live Redis. ioredis-mock shares one store
 * across instances, so a single client is flushed between tests.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import RedisMock from "ioredis-mock";
import type { Redis } from "ioredis";
import { createChatMuteRegistry, type ChatMuteRegistry } from "./chat-mute";

const client = new RedisMock() as unknown as Redis;
const registry: ChatMuteRegistry = createChatMuteRegistry(client);

const base = {
  userId: "u1",
  name: "Budi",
  by: "sup-1",
  reason: "spam",
};

beforeEach(async () => {
  await client.flushall();
});

describe("chat-mute registry", () => {
  it("returns null for a user who is not muted", async () => {
    expect(await registry.isMuted("u1")).toBeNull();
  });

  it("records a timed mute and reports it active before expiry", async () => {
    const mutedUntil = Date.now() + 60_000;
    await registry.mute({ ...base, mutedUntil });
    const status = await registry.isMuted("u1");
    expect(status).toEqual({ mutedUntil, reason: "spam" });
  });

  it("treats a timed mute past its deadline as lifted", async () => {
    await registry.mute({ ...base, mutedUntil: Date.now() - 1 });
    expect(await registry.isMuted("u1")).toBeNull();
  });

  it("records an indefinite mute (no deadline)", async () => {
    await registry.mute({ ...base, mutedUntil: null });
    const status = await registry.isMuted("u1");
    expect(status).toEqual({ mutedUntil: null, reason: "spam" });
  });

  it("unmutes a user", async () => {
    await registry.mute({ ...base, mutedUntil: null });
    await registry.unmute("u1");
    expect(await registry.isMuted("u1")).toBeNull();
  });

  it("lists all active mutes for the console", async () => {
    await registry.mute({ ...base, mutedUntil: null });
    await registry.mute({
      userId: "u2",
      name: "Citra",
      by: "sup-1",
      reason: "off-topic",
      mutedUntil: Date.now() + 120_000,
    });
    const mutes = await registry.listMuted();
    expect(mutes).toHaveLength(2);
    const ids = mutes.map((m) => m.userId).sort();
    expect(ids).toEqual(["u1", "u2"]);
  });

  it("omits expired mutes from the list", async () => {
    await registry.mute({ ...base, mutedUntil: Date.now() - 1 });
    expect(await registry.listMuted()).toHaveLength(0);
  });
});
