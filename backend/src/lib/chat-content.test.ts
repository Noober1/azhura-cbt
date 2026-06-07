/**
 * Unit tests for chat content sanitization (#17).
 *
 * Pure logic — no socket/DB. Verifies trimming, empty/length rejection, control
 * character and angle-bracket stripping, and that emoji survive intact.
 */

import { describe, it, expect } from "bun:test";
import { sanitizeChatContent } from "./chat-content";

const MAX = 500;

describe("sanitizeChatContent", () => {
  it("accepts and trims a normal message", () => {
    const result = sanitizeChatContent("  halo dunia  ", MAX);
    expect(result).toEqual({ ok: true, content: "halo dunia" });
  });

  it("rejects a non-string payload", () => {
    expect(sanitizeChatContent(42, MAX).ok).toBe(false);
    expect(sanitizeChatContent(undefined, MAX).ok).toBe(false);
    expect(sanitizeChatContent({ message: "x" }, MAX).ok).toBe(false);
  });

  it("rejects an empty or whitespace-only message", () => {
    expect(sanitizeChatContent("", MAX).ok).toBe(false);
    expect(sanitizeChatContent("    ", MAX).ok).toBe(false);
  });

  it("rejects a message longer than the cap", () => {
    const result = sanitizeChatContent("a".repeat(MAX + 1), MAX);
    expect(result.ok).toBe(false);
  });

  it("accepts a message exactly at the cap", () => {
    const result = sanitizeChatContent("a".repeat(MAX), MAX);
    expect(result.ok).toBe(true);
  });

  it("strips angle brackets so no markup can be stored", () => {
    const result = sanitizeChatContent("<script>alert(1)</script>", MAX);
    expect(result).toEqual({ ok: true, content: "scriptalert(1)/script" });
  });

  it("collapses control characters and whitespace runs into single spaces", () => {
    const result = sanitizeChatContent("a\n\nb\t\tc   d", MAX);
    expect(result).toEqual({ ok: true, content: "a b c d" });
  });

  it("preserves emoji (4-byte code points)", () => {
    const result = sanitizeChatContent("halo 👋🎉 dunia", MAX);
    expect(result).toEqual({ ok: true, content: "halo 👋🎉 dunia" });
  });

  it("preserves @mention text", () => {
    const result = sanitizeChatContent("@Budi apa kabar?", MAX);
    expect(result).toEqual({ ok: true, content: "@Budi apa kabar?" });
  });
});
