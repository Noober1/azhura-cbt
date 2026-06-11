import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeJwt, isExpired, type JwtClaims } from "../jwt";

/**
 * Builds a syntactically valid (unsigned) JWT whose payload is `claims`.
 * Encodes the payload as base64url so it exercises decodeJwt's real path,
 * including the `-`/`_` and missing-padding handling.
 */
function makeToken(claims: Record<string, unknown>): string {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify(claims));
  return `${header}.${payload}.signature-not-verified`;
}

function base64Url(json: string): string {
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const baseClaims = {
  userId: "u-1",
  nis: "12345",
  role: "admin" as const,
  groupId: "",
};

describe("decodeJwt", () => {
  it("decodes the payload of a well-formed token", () => {
    const token = makeToken({ ...baseClaims, exp: 1_900_000_000, iat: 1_800_000_000 });

    const claims = decodeJwt(token);

    expect(claims).toEqual({
      userId: "u-1",
      nis: "12345",
      role: "admin",
      groupId: "",
      exp: 1_900_000_000,
      iat: 1_800_000_000,
    });
  });

  it("decodes a supervisor token with an empty groupId", () => {
    const token = makeToken({ ...baseClaims, role: "supervisor", groupId: "" });
    expect(decodeJwt(token)?.role).toBe("supervisor");
  });

  it("decodes a payload containing base64url-only characters (- and _)", () => {
    // A long userId raises the odds of '+' / '/' bytes in standard base64,
    // confirming the URL-safe substitution round-trips correctly.
    const token = makeToken({ ...baseClaims, userId: "??>>><<<~~~ffff" });
    expect(decodeJwt(token)?.userId).toBe("??>>><<<~~~ffff");
  });

  it("returns null when the token does not have three segments", () => {
    expect(decodeJwt("only.two")).toBeNull();
    expect(decodeJwt("a.b.c.d")).toBeNull();
    expect(decodeJwt("")).toBeNull();
  });

  it("returns null when the payload is not valid base64/JSON", () => {
    expect(decodeJwt("header.@@@not-base64@@@.sig")).toBeNull();
  });

  it("returns null when the decoded payload lacks a role", () => {
    const token = makeToken({ userId: "u-1", nis: "12345", groupId: "" });
    expect(decodeJwt(token)).toBeNull();
  });
});

describe("isExpired", () => {
  const NOW_MS = 1_800_000_000_000; // fixed wall clock in ms

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports a token whose exp (seconds) is in the past as expired", () => {
    const claims: JwtClaims = { ...baseClaims, exp: NOW_MS / 1000 - 60 };
    expect(isExpired(claims)).toBe(true);
  });

  it("reports a token whose exp is in the future as not expired", () => {
    const claims: JwtClaims = { ...baseClaims, exp: NOW_MS / 1000 + 60 };
    expect(isExpired(claims)).toBe(false);
  });

  it("treats an exp exactly equal to now as expired (inclusive boundary)", () => {
    const claims: JwtClaims = { ...baseClaims, exp: NOW_MS / 1000 };
    expect(isExpired(claims)).toBe(true);
  });

  it("treats a token without an exp as never expiring", () => {
    const claims: JwtClaims = { ...baseClaims };
    expect(isExpired(claims)).toBe(false);
  });
});
