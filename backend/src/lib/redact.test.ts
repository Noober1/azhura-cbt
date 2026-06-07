/**
 * Unit tests for log field redaction (#18). Pure — no DB/HTTP.
 */

import { describe, it, expect } from "bun:test";
import { redactFields, REDACTED } from "./redact";

describe("redactFields", () => {
  it("returns null for nullish input", () => {
    expect(redactFields(undefined)).toBeNull();
    expect(redactFields(null)).toBeNull();
  });

  it("passes through non-sensitive fields unchanged", () => {
    const input = { nis: "12345", role: "student", count: 3 };
    expect(redactFields(input)).toEqual(input);
  });

  it("redacts password, token, and answer-key fields", () => {
    const out = redactFields({
      password: "s3cret",
      token: "ABCD",
      correctOptionId: "opt-1",
      nis: "12345",
    });
    expect(out).toEqual({
      password: REDACTED,
      token: REDACTED,
      correctOptionId: REDACTED,
      nis: "12345",
    });
  });

  it("matches sensitive keys case-insensitively and by substring", () => {
    const out = redactFields({
      passwordHash: "x",
      JWT_Token: "y",
      newPassphrase: "z",
    });
    expect(out).toEqual({
      passwordHash: REDACTED,
      JWT_Token: REDACTED,
      newPassphrase: REDACTED,
    });
  });

  it("redacts nested objects and arrays at any depth", () => {
    const out = redactFields({
      user: { nis: "1", password: "p" },
      sessions: [{ id: "a", token: "T" }],
    });
    expect(out).toEqual({
      user: { nis: "1", password: REDACTED },
      sessions: [{ id: "a", token: REDACTED }],
    });
  });

  it("does not mutate the original object", () => {
    const input = { password: "p", nis: "1" };
    redactFields(input);
    expect(input.password).toBe("p");
  });
});
