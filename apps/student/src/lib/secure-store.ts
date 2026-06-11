/**
 * Azhura CBT App - Encrypted Credential Store (Stronghold, native-only) — #129
 *
 * Persists the student's JWT **encrypted at rest** on the desktop build via the
 * IOTA Stronghold plugin (`@tauri-apps/plugin-stronghold`), replacing the old
 * plaintext-localStorage approach under Tauri. The snapshot is an encrypted
 * key-value DB on disk; the key is derived in Rust (argon2 + persisted random
 * salt — see `src-tauri/src/lib.rs`) from the vault password supplied below.
 *
 * Scope & threat model:
 * - Goal: prevent a casual reader (another student, a quick disk peek) from
 *   lifting a valid JWT off a SHARED exam workstation. It is NOT meant to defend
 *   against an attacker who fully controls the machine — there is no per-user
 *   secret to bind to (the token *is* the secret we are protecting, and there is
 *   no human passphrase at hydration time on a kiosk).
 * - Therefore the vault password is a FIXED application constant. This is a
 *   deliberate, documented tradeoff: it still yields encryption-at-rest (the
 *   snapshot file is not human-readable plaintext) while keeping the kiosk flow
 *   passwordless. Rotating it would orphan existing snapshots (treated as "no
 *   token" → re-login), which is acceptable.
 *
 * Web mode: this module is never used on web — the auth store keeps localStorage
 * unchanged there. Every export here additionally no-ops outside Tauri so it is
 * safe to import unconditionally.
 *
 * Failure policy: a Stronghold failure (locked/corrupt snapshot, plugin error)
 * is logged via `createLogger` and degrades gracefully — reads return `null`
 * ("no token" → logged-out), writes/removes resolve without throwing. Callers
 * must never crash because the vault is unavailable.
 */

import type { User } from "../types";
import { createLogger } from "./logger";

const log = createLogger("SecureStore");

/** Minimal shape of the Stronghold `Store` we depend on (narrow, no `any`). */
interface StrongholdStore {
  get: (key: string) => Promise<Uint8Array | null>;
  insert: (key: string, value: number[]) => Promise<void>;
  remove: (key: string) => Promise<Uint8Array | null>;
}

/** Minimal shape of the Stronghold instance handle we depend on. */
interface StrongholdHandle {
  save: () => Promise<void>;
}

/** Vault snapshot filename, created under the app-local data directory. */
const VAULT_FILE = "azhura-credentials.hold";

/**
 * Fixed application vault password. See the module header for why a constant is
 * used instead of a user secret. The actual on-disk encryption key is derived
 * from this via argon2 + a per-install random salt in Rust, so this string
 * alone is not the encryption key.
 */
const VAULT_PASSWORD = "azhura-cbt-credential-vault-v1";

/** Stronghold client namespace holding the credential store. */
const CLIENT_NAME = "azhura-auth";

/** Record key under which the JWT is stored inside the client's store. */
const TOKEN_KEY = "cbt_token";

/** Record key for the (non-JWT) identity blob {userId, user}. */
const IDENTITY_KEY = "cbt_identity";

/** @returns `true` when running inside a Tauri WebView (desktop build). */
const isTauri = (): boolean =>
  typeof window !== "undefined" &&
  (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !==
    undefined;

/**
 * Cached store handle + parent Stronghold, lazily initialized on first use.
 * The init promise is memoized so concurrent callers (e.g. login firing while
 * hydration is in flight) share one unlock attempt instead of racing.
 */
let storePromise: Promise<{
  store: StrongholdStore;
  stronghold: StrongholdHandle;
} | null> | null = null;

/**
 * Opens (or creates) the encrypted vault and resolves its key-value store.
 * Memoized: the first call performs the unlock; subsequent calls reuse it.
 *
 * @returns The store + Stronghold handle, or `null` when not in Tauri or when
 *          the vault could not be unlocked (caller treats `null` as "no token").
 */
const getStore = (): Promise<{
  store: StrongholdStore;
  stronghold: StrongholdHandle;
} | null> => {
  if (!isTauri()) return Promise.resolve(null);
  if (storePromise) return storePromise;

  storePromise = (async () => {
    try {
      // Dynamic imports keep these native-only modules out of the web bundle's
      // eager graph (same pattern as storage.ts / app-store.ts).
      const { Stronghold } = await import("@tauri-apps/plugin-stronghold");
      const { appLocalDataDir, join } = await import("@tauri-apps/api/path");

      const vaultPath = await join(await appLocalDataDir(), VAULT_FILE);
      const stronghold = await Stronghold.load(vaultPath, VAULT_PASSWORD);

      // loadClient rejects if the client does not exist yet (first run), so we
      // fall back to createClient rather than relying on a falsy return.
      const client = await stronghold
        .loadClient(CLIENT_NAME)
        .catch(() => stronghold.createClient(CLIENT_NAME));

      const store = client.getStore() as unknown as StrongholdStore;
      return { store, stronghold: stronghold as unknown as StrongholdHandle };
    } catch (error) {
      // Locked/corrupt snapshot, wrong password, or plugin failure: degrade to
      // "no secure store". Reset the memo so a later attempt (e.g. after the
      // snapshot is recreated) can retry instead of being stuck on this failure.
      log.error("Failed to open Stronghold vault — treating as no token", error);
      storePromise = null;
      return null;
    }
  })();

  return storePromise;
};

/**
 * Persists the JWT into the encrypted vault. No-op outside Tauri. Never throws:
 * a failure is logged and the token simply isn't persisted (the in-memory
 * session still works for this run; a restart would require re-login).
 *
 * @param token The JWT to encrypt at rest.
 */
export const saveToken = async (token: string): Promise<void> => {
  const handle = await getStore();
  if (!handle) return;

  try {
    const bytes = Array.from(new TextEncoder().encode(token));
    await handle.store.insert(TOKEN_KEY, bytes);
    // insert() only mutates the in-memory snapshot; save() flushes it to disk.
    await handle.stronghold.save();
  } catch (error) {
    log.error("Failed to persist token to Stronghold", error);
  }
};

/**
 * Reads the JWT from the encrypted vault. No-op (returns `null`) outside Tauri.
 * Never throws: any failure resolves to `null` so the caller treats it as a
 * logged-out state rather than crashing the app.
 *
 * @returns The stored JWT, or `null` when absent/unreadable.
 */
export const getToken = async (): Promise<string | null> => {
  const handle = await getStore();
  if (!handle) return null;

  try {
    const bytes = await handle.store.get(TOKEN_KEY);
    if (!bytes || bytes.length === 0) return null;
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch (error) {
    log.error("Failed to read token from Stronghold", error);
    return null;
  }
};

/**
 * Removes the JWT from the encrypted vault. No-op outside Tauri. Never throws:
 * a failure is logged, and the in-memory session is cleared by the caller
 * regardless, so a removal error can never strand the user logged-in.
 */
export const removeToken = async (): Promise<void> => {
  const handle = await getStore();
  if (!handle) return;

  try {
    await handle.store.remove(TOKEN_KEY);
    await handle.stronghold.save();
  } catch (error) {
    log.error("Failed to remove token from Stronghold", error);
  }
};

/** Persisted identity blob: the non-JWT session info restored on native startup. */
export interface StoredIdentity {
  userId: string;
  user: User;
}

/**
 * Persists the participant identity (userId + user) alongside the token so a
 * native restart restores the FULL session — not just the JWT — keeping this
 * mildly-sensitive PII encrypted at rest too. No-op outside Tauri; never throws.
 */
export const saveIdentity = async (userId: string, user: User): Promise<void> => {
  const handle = await getStore();
  if (!handle) return;

  try {
    const json = JSON.stringify({ userId, user } satisfies StoredIdentity);
    const bytes = Array.from(new TextEncoder().encode(json));
    await handle.store.insert(IDENTITY_KEY, bytes);
    await handle.stronghold.save();
  } catch (error) {
    log.error("Failed to persist identity to Stronghold", error);
  }
};

/** Reads the persisted identity blob. Returns `null` outside Tauri / on any failure. */
export const getIdentity = async (): Promise<StoredIdentity | null> => {
  const handle = await getStore();
  if (!handle) return null;

  try {
    const bytes = await handle.store.get(IDENTITY_KEY);
    if (!bytes || bytes.length === 0) return null;
    const json = new TextDecoder().decode(new Uint8Array(bytes));
    const parsed = JSON.parse(json) as Partial<StoredIdentity>;
    if (!parsed || typeof parsed.userId !== "string" || !parsed.user) return null;
    return { userId: parsed.userId, user: parsed.user };
  } catch (error) {
    log.error("Failed to read identity from Stronghold", error);
    return null;
  }
};

/** Removes the persisted identity blob. No-op outside Tauri; never throws. */
export const removeIdentity = async (): Promise<void> => {
  const handle = await getStore();
  if (!handle) return;

  try {
    await handle.store.remove(IDENTITY_KEY);
    await handle.stronghold.save();
  } catch (error) {
    log.error("Failed to remove identity from Stronghold", error);
  }
};

/** Forces a fresh vault handle on next access. Used in tests. */
export const _resetSecureStoreCache = (): void => {
  storePromise = null;
};
