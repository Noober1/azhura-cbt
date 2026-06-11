import { describe, it, expect } from "vitest";

/**
 * secure-store.ts encrypts the JWT via Stronghold on native (#129). The vitest
 * env is "node" (no `window`, so `__TAURI_INTERNALS__` is absent) → it degrades
 * to a no-op, exactly as the web build does: reads return `null`, writes/removes
 * resolve without throwing, and nothing is persisted. That graceful degradation
 * (which keeps the WEB auth path untouched) is what we verify here; the real
 * encrypted-at-rest behavior is covered by manual E2E in Tauri.
 */

describe("secure-store (non-Tauri / Node env — all ops are no-ops)", () => {
  it("getToken returns null when there is no Tauri runtime", async () => {
    const { getToken } = await import("../secure-store");
    await expect(getToken()).resolves.toBeNull();
  });

  it("saveToken resolves without error and does not throw", async () => {
    const { saveToken } = await import("../secure-store");
    await expect(saveToken("dummy.jwt.token")).resolves.toBeUndefined();
  });

  it("removeToken resolves without error", async () => {
    const { removeToken } = await import("../secure-store");
    await expect(removeToken()).resolves.toBeUndefined();
  });

  it("saving then reading still yields null (nothing persisted off-Tauri)", async () => {
    const { saveToken, getToken } = await import("../secure-store");
    await saveToken("should-not-persist");
    await expect(getToken()).resolves.toBeNull();
  });

  it("_resetSecureStoreCache is callable and does not throw", async () => {
    const { _resetSecureStoreCache } = await import("../secure-store");
    expect(() => _resetSecureStoreCache()).not.toThrow();
  });
});
