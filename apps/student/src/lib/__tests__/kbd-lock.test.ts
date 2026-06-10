import { describe, it, expect } from "vitest";

/**
 * kbd-lock.ts bridges to the L3 Rust keyboard hook (#27). The vitest env is
 * "node" (no `window`, so `__TAURI_INTERNALS__` is absent) → every function
 * degrades to a no-op, exactly as it does in the web build. That graceful
 * degradation is what we verify here; the real hook behavior (swallowing
 * Alt+Tab/Win at the OS level) is covered by `should_swallow` unit tests in
 * Rust plus manual E2E on Windows.
 */

describe("kbd-lock (non-Tauri / Node env — all ops are no-ops)", () => {
  it("enableKbdLock resolves without error", async () => {
    const { enableKbdLock } = await import("../kbd-lock");
    await expect(enableKbdLock()).resolves.toBeUndefined();
  });

  it("disableKbdLock resolves without error", async () => {
    const { disableKbdLock } = await import("../kbd-lock");
    await expect(disableKbdLock()).resolves.toBeUndefined();
  });

  it("listenKbdLockEvents resolves to a callable unlisten function", async () => {
    const { listenKbdLockEvents } = await import("../kbd-lock");
    const unlisten = await listenKbdLockEvents();
    expect(typeof unlisten).toBe("function");
    expect(() => unlisten()).not.toThrow();
  });
});
