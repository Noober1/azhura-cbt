import { describe, it, expect } from "vitest";
import { hashPassphrase, verifyPassphrase } from "../crypto";

describe("hashPassphrase", () => {
  it("returns a 64-char hex string", async () => {
    const hash = await hashPassphrase("azhura");
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("is deterministic for the same input", async () => {
    const a = await hashPassphrase("hello");
    const b = await hashPassphrase("hello");
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", async () => {
    const a = await hashPassphrase("azhura");
    const b = await hashPassphrase("azhura2");
    expect(a).not.toBe(b);
  });
});

describe("verifyPassphrase", () => {
  it("returns true when text matches hash", async () => {
    const hash = await hashPassphrase("azhura");
    expect(await verifyPassphrase("azhura", hash)).toBe(true);
  });

  it("returns false when text does not match hash", async () => {
    const hash = await hashPassphrase("azhura");
    expect(await verifyPassphrase("wrong", hash)).toBe(false);
  });

  it("is case-sensitive", async () => {
    const hash = await hashPassphrase("Azhura");
    expect(await verifyPassphrase("azhura", hash)).toBe(false);
  });
});
