/**
 * Thin wrapper around @tauri-apps/plugin-store for persisting app configuration.
 * In web mode (non-Tauri), all operations are no-ops / return null so the app
 * continues to function using env-var defaults.
 */

import type { SchoolInfo, AntiCheatConfig } from "@azhura/shared";

export interface AppStoreData {
  serverUrl?: string;
  schoolInfo?: SchoolInfo;
  passphraseHash?: string;
  antiCheat?: Partial<AntiCheatConfig>;
  debugMode?: boolean;
}

type AppStoreKey = keyof AppStoreData;

const STORE_FILE = "azhura-config.json";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Lazily loaded plugin-store instance to avoid import errors in web mode.
let storeInstance: import("@tauri-apps/plugin-store").Store | null = null;

async function getStore(): Promise<import("@tauri-apps/plugin-store").Store | null> {
  if (!isTauri()) return null;
  if (!storeInstance) {
    const { load } = await import("@tauri-apps/plugin-store");
    storeInstance = await load(STORE_FILE);
  }
  return storeInstance;
}

export async function appStoreGet<K extends AppStoreKey>(
  key: K
): Promise<AppStoreData[K] | null> {
  const store = await getStore();
  if (!store) return null;
  return (await store.get<AppStoreData[K]>(key)) ?? null;
}

export async function appStoreSet<K extends AppStoreKey>(
  key: K,
  value: AppStoreData[K]
): Promise<void> {
  const store = await getStore();
  if (!store) return;
  await store.set(key, value);
}

export async function appStoreDelete(key: AppStoreKey): Promise<void> {
  const store = await getStore();
  if (!store) return;
  await store.delete(key);
}

export async function appStoreClear(): Promise<void> {
  const store = await getStore();
  if (!store) return;
  await store.clear();
}

/** Forces a fresh store instance on next access. Used in tests. */
export function _resetStoreInstance(): void {
  storeInstance = null;
}
