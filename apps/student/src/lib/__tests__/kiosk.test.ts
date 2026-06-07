import { describe, it, expect } from "vitest";

/**
 * kiosk.ts bridges to Tauri window commands. The vitest env is "node" (no
 * `window`, so `__TAURI_INTERNALS__` is absent) → every function degrades to a
 * no-op, exactly as it does in the web build. That graceful degradation is what
 * we verify here; the real kiosk behavior is covered by manual E2E in Tauri.
 */

describe("kiosk (non-Tauri / Node env — all ops are no-ops)", () => {
  it("enterKiosk resolves without error", async () => {
    const { enterKiosk } = await import("../kiosk");
    await expect(enterKiosk()).resolves.toBeUndefined();
  });

  it("exitKiosk resolves without error", async () => {
    const { exitKiosk } = await import("../kiosk");
    await expect(exitKiosk()).resolves.toBeUndefined();
  });

  it("listenKioskEvents resolves to a callable unlisten function", async () => {
    const { listenKioskEvents } = await import("../kiosk");
    const unlisten = await listenKioskEvents();
    expect(typeof unlisten).toBe("function");
    expect(() => unlisten()).not.toThrow();
  });
});
