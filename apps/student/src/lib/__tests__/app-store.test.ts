import { describe, it, expect } from "vitest";

// app-store uses @tauri-apps/plugin-store which is unavailable in Node/web mode.
// The vitest env is "node" (no window), so isTauri() returns false and all
// operations are no-ops that return null/undefined — that's what we verify.

describe("app-store (non-Tauri / Node env — all ops are no-ops)", () => {
  it("appStoreGet returns null", async () => {
    const { appStoreGet } = await import("../app-store");
    const val = await appStoreGet("serverUrl");
    expect(val).toBeNull();
  });

  it("appStoreSet resolves without error", async () => {
    const { appStoreSet } = await import("../app-store");
    await expect(appStoreSet("serverUrl", "http://localhost:3000")).resolves.toBeUndefined();
  });

  it("appStoreDelete resolves without error", async () => {
    const { appStoreDelete } = await import("../app-store");
    await expect(appStoreDelete("serverUrl")).resolves.toBeUndefined();
  });

  it("appStoreClear resolves without error", async () => {
    const { appStoreClear } = await import("../app-store");
    await expect(appStoreClear()).resolves.toBeUndefined();
  });
});
