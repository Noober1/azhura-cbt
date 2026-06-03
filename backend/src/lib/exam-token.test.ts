/**
 * Unit tests for the exam access-token check (#1).
 *
 * Covers the open-exam pass-through, the missing/invalid-format/mismatch
 * rejections, and case-sensitivity — the rules the session endpoint relies on.
 */

import { describe, it, expect } from "bun:test";
import { checkExamToken } from "./exam-token";

describe("checkExamToken", () => {
  it("grants access when the exam has no token (open exam)", () => {
    expect(checkExamToken(null)).toBe("ok");
    // A supplied token is simply ignored for an open exam.
    expect(checkExamToken(null, "ABC12")).toBe("ok");
  });

  it("grants access when a well-formed token matches exactly", () => {
    expect(checkExamToken("Ab12c", "Ab12c")).toBe("ok");
  });

  it("reports missing when a required token is not supplied", () => {
    expect(checkExamToken("Ab12c")).toBe("missing");
    expect(checkExamToken("Ab12c", "")).toBe("missing");
  });

  it("is case-sensitive", () => {
    expect(checkExamToken("Ab12c", "ab12c")).toBe("mismatch");
    expect(checkExamToken("Ab12c", "AB12C")).toBe("mismatch");
  });

  it("reports mismatch for a well-formed but wrong token", () => {
    expect(checkExamToken("Ab12c", "X9z0Q")).toBe("mismatch");
  });

  it("rejects non-alphanumeric tokens as invalid format", () => {
    expect(checkExamToken("Ab12c", "Ab-1")).toBe("invalid_format");
    expect(checkExamToken("Ab12c", "Ab 1")).toBe("invalid_format");
    expect(checkExamToken("Ab12c", "Ab@1")).toBe("invalid_format");
  });

  it("rejects tokens longer than 5 characters as invalid format", () => {
    expect(checkExamToken("Ab12c", "Ab12cd")).toBe("invalid_format");
  });

  it("checks format before matching (over-long correct prefix still invalid)", () => {
    // Even though it starts with the right characters, length > 5 is invalid.
    expect(checkExamToken("Ab12c", "Ab12c9")).toBe("invalid_format");
  });
});
