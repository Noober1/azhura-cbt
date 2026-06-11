import { describe, it, expect } from "vitest";
import type { AntiCheatConfig } from "@azhura/shared";
import { isEnforcementActive } from "../tour";

/**
 * `isEnforcementActive` is the single safety gate that keeps the exam-session
 * product tour (#145) out of a locked-down exam. It must return `true` whenever
 * ANY enforcement layer that a tour overlay could fight (fullscreen) or that
 * could mistake a tour for a violation (focus-loss / OS keyboard lock) is on.
 * Pure + DOM-free, matching the node vitest env.
 */

/** Builds an AntiCheatConfig with every flag off, then applies overrides. */
const cfg = (overrides: Partial<AntiCheatConfig> = {}): AntiCheatConfig => ({
  enabled: false,
  fullscreen: false,
  blockShortcuts: false,
  detectFocusLoss: false,
  detectMultiMonitor: false,
  blockOsKeyboard: false,
  ...overrides,
});

describe("isEnforcementActive", () => {
  it("is false when anti-cheat is entirely disabled", () => {
    expect(isEnforcementActive(cfg())).toBe(false);
  });

  it("is false when enabled but no enforcement layer is on", () => {
    // blockShortcuts / detectMultiMonitor alone do not create a tour hazard:
    // they neither fight fullscreen nor look like a focus-loss violation.
    expect(isEnforcementActive(cfg({ enabled: true }))).toBe(false);
    expect(isEnforcementActive(cfg({ enabled: true, blockShortcuts: true }))).toBe(false);
    expect(isEnforcementActive(cfg({ enabled: true, detectMultiMonitor: true }))).toBe(false);
  });

  it("is true when fullscreen is enforced", () => {
    expect(isEnforcementActive(cfg({ enabled: true, fullscreen: true }))).toBe(true);
  });

  it("is true when focus-loss detection is on", () => {
    expect(isEnforcementActive(cfg({ enabled: true, detectFocusLoss: true }))).toBe(true);
  });

  it("is true when the OS keyboard lock is on", () => {
    expect(isEnforcementActive(cfg({ enabled: true, blockOsKeyboard: true }))).toBe(true);
  });

  it("stays false if a hazard flag is set but the master switch is off", () => {
    // The master `enabled` gate wins — nothing is enforced while it is off.
    expect(
      isEnforcementActive(
        cfg({ enabled: false, fullscreen: true, detectFocusLoss: true, blockOsKeyboard: true })
      )
    ).toBe(false);
  });

  it("is true for a fully locked-down exam", () => {
    expect(
      isEnforcementActive(
        cfg({
          enabled: true,
          fullscreen: true,
          blockShortcuts: true,
          detectFocusLoss: true,
          detectMultiMonitor: true,
          blockOsKeyboard: true,
        })
      )
    ).toBe(true);
  });
});
