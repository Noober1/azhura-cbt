import { describe, it, expect } from "vitest";
import { parseMentions, findActiveMention, applyMention } from "../mentions";

describe("parseMentions", () => {
  const names = ["Budi", "Budi Santoso", "Ahmad Faisal"];

  it("returns a single text segment when there are no mentions", () => {
    expect(parseMentions("halo dunia", names)).toEqual([
      { type: "text", value: "halo dunia" },
    ]);
  });

  it("recognizes a mention surrounded by text", () => {
    expect(parseMentions("hai @Budi apa kabar", names)).toEqual([
      { type: "text", value: "hai " },
      { type: "mention", value: "Budi" },
      { type: "text", value: " apa kabar" },
    ]);
  });

  it("prefers the longest matching name", () => {
    expect(parseMentions("@Budi Santoso hadir", names)).toEqual([
      { type: "mention", value: "Budi Santoso" },
      { type: "text", value: " hadir" },
    ]);
  });

  it("matches case-insensitively but preserves typed casing", () => {
    expect(parseMentions("@budi yo", names)).toEqual([
      { type: "mention", value: "budi" },
      { type: "text", value: " yo" },
    ]);
  });

  it("leaves an unknown @token as plain text", () => {
    expect(parseMentions("@nobody hi", names)).toEqual([
      { type: "text", value: "@nobody hi" },
    ]);
  });

  it("does not let a short name swallow a longer word (boundary check)", () => {
    // "A" must not match inside "@Ahmad".
    expect(parseMentions("@Ahmadi", ["A", "Budi"])).toEqual([
      { type: "text", value: "@Ahmadi" },
    ]);
  });

  it("matches a name followed by punctuation", () => {
    expect(parseMentions("@Budi, halo", names)).toEqual([
      { type: "mention", value: "Budi" },
      { type: "text", value: ", halo" },
    ]);
  });
});

describe("findActiveMention", () => {
  it("finds the token being typed at the caret", () => {
    const value = "hai @Bud";
    expect(findActiveMention(value, value.length)).toEqual({ query: "Bud", start: 4 });
  });

  it("returns null once a space ends the token", () => {
    const value = "hai @Budi ";
    expect(findActiveMention(value, value.length)).toBeNull();
  });

  it("returns an empty query right after the @", () => {
    const value = "halo @";
    expect(findActiveMention(value, value.length)).toEqual({ query: "", start: 5 });
  });

  it("does not trigger on an @ inside a word (email-like)", () => {
    const value = "budi@sekolah";
    expect(findActiveMention(value, value.length)).toBeNull();
  });

  it("triggers at the very start of the input", () => {
    const value = "@Bud";
    expect(findActiveMention(value, value.length)).toEqual({ query: "Bud", start: 0 });
  });
});

describe("applyMention", () => {
  it("replaces the active token with the full name plus a trailing space", () => {
    const value = "hai @Bud";
    const result = applyMention(value, 4, value.length, "Budi Santoso");
    expect(result.value).toBe("hai @Budi Santoso ");
    expect(result.caret).toBe(result.value.length);
  });

  it("keeps text after the caret intact", () => {
    const value = "@Bu sip";
    // caret is right after "@Bu" (index 3)
    const result = applyMention(value, 0, 3, "Budi");
    expect(result.value).toBe("@Budi  sip");
  });
});
