import { describe, it, expect } from "vitest";
import { matchBlockedShortcut, type ShortcutLike } from "../anti-cheat-config";

/**
 * Pure unit coverage for the L1 shortcut blocklist (#25). The DOM listener
 * wiring is exercised by manual E2E (see CLAUDE.md); here we pin down exactly
 * which keystrokes are blocked and which pass through.
 */

/** Builds the (event, lowercased-key) argument pair the matcher receives. */
function match(e: ShortcutLike): string | null {
  return matchBlockedShortcut(e, e.key?.toLowerCase());
}

describe("matchBlockedShortcut — blocked keystrokes", () => {
  it("blocks F12 (DevTools)", () => {
    expect(match({ key: "F12" })).toBe("F12 (DevTools)");
  });

  it("blocks F5 (refresh)", () => {
    expect(match({ key: "F5" })).toBe("Refresh Halaman");
  });

  it("blocks Ctrl+R (refresh)", () => {
    expect(match({ key: "r", ctrlKey: true })).toBe("Refresh Halaman");
  });

  it("blocks Ctrl+Shift+I / J / C (DevTools family)", () => {
    expect(match({ key: "I", ctrlKey: true, shiftKey: true })).toContain("DevTools");
    expect(match({ key: "J", ctrlKey: true, shiftKey: true })).toContain("Console");
    expect(match({ key: "C", ctrlKey: true, shiftKey: true })).toContain("Inspect");
  });

  it("blocks Ctrl+P / S / U", () => {
    expect(match({ key: "p", ctrlKey: true })).toContain("Print");
    expect(match({ key: "s", ctrlKey: true })).toContain("Save");
    expect(match({ key: "u", ctrlKey: true })).toContain("View Source");
  });

  it("flags Alt+Tab (logged but cannot be prevented at DOM level)", () => {
    expect(match({ key: "Tab", altKey: true })).toBe("Alt+Tab");
  });
});

describe("matchBlockedShortcut — allowed keystrokes", () => {
  it("allows plain typing", () => {
    expect(match({ key: "a" })).toBeNull();
    expect(match({ key: "Enter" })).toBeNull();
    expect(match({ key: " " })).toBeNull();
  });

  it("does not block Ctrl+P when Shift is also held (not the print combo)", () => {
    expect(match({ key: "p", ctrlKey: true, shiftKey: true })).toBeNull();
  });

  it("does not block Ctrl+C copy via the shortcut matcher (handled by clipboard listener)", () => {
    expect(match({ key: "c", ctrlKey: true })).toBeNull();
  });

  it("does not block a bare Shift+I (no Ctrl)", () => {
    expect(match({ key: "i", shiftKey: true })).toBeNull();
  });
});
