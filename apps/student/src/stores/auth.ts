/**
 * Azhura CBT App - Authentication Store (Zustand)
 *
 * Owns the student's authentication state (JWT token, user identity) and the
 * login/logout/token-validation lifecycle.
 *
 * Persistence differs by platform (#129):
 * - **Web:** the JWT lives in `localStorage` and is hydrated SYNCHRONOUSLY in
 *   the store initializer, so a refresh keeps the session with zero extra UX.
 * - **Tauri (desktop):** the JWT is stored ENCRYPTED AT REST via Stronghold
 *   (`lib/secure-store`), never in localStorage. Because Stronghold is async,
 *   the token starts `null` and is hydrated by `initAuth()` at startup; the
 *   `initialized` flag gates protected routes until that completes.
 */

import { create } from "zustand";
import { User } from "../types";
import api from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { clearLocalDbAnswers } from "../lib/storage";
import {
  getIdentity,
  getToken,
  removeIdentity,
  removeToken,
  saveIdentity,
  saveToken,
} from "../lib/secure-store";
import { createLogger } from "../lib/logger";
import { getErrorMessage, safeJsonParse, toErrorContext } from "../lib/errors";

const log = createLogger("Auth");

interface AuthState {
  token: string | null;
  userId: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  /**
   * Whether startup auth hydration has finished. On web this is `true` from the
   * first render (sync localStorage hydration). On Tauri it starts `false` and
   * flips once `initAuth()` has read the encrypted token, so protected routes
   * don't bounce to /login before the vault is read.
   */
  initialized: boolean;
  /** Authenticates with NIS + password. @returns `true` on success. */
  login: (nis: string, password: string) => Promise<boolean>;
  /** Clears all session state and persisted credentials. */
  logout: () => Promise<void>;
  /** Verifies the stored token with the server; auto-logs-out if invalid. */
  validateToken: () => Promise<boolean>;
  /**
   * Hydrates auth state at app startup. Web is a no-op flip (already hydrated
   * synchronously); Tauri reads the encrypted token, validates it, and flips
   * `initialized`. Safe to call once at bootstrap.
   */
  initAuth: () => Promise<void>;
}

/** @returns `true` when running inside a Tauri WebView (desktop build). */
const isTauri = (): boolean =>
  typeof window !== "undefined" &&
  (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !==
    undefined;

const isBrowser = typeof window !== "undefined";

/**
 * Whether the auth state hydrates from localStorage at all. Only true for the
 * plain web build. Under Tauri nothing auth-related touches localStorage: the
 * token AND the identity (userId/user) live encrypted in Stronghold and are
 * loaded asynchronously by `initAuth()` at startup, so a native restart restores
 * the full session with that PII kept encrypted at rest rather than plaintext.
 */
const useLocalStorageAuth = isBrowser && !isTauri();

/** Removes all persisted auth keys from localStorage (best-effort). */
const clearPersistedAuth = (): void => {
  if (!isBrowser) return;
  try {
    localStorage.removeItem("cbt_token");
    localStorage.removeItem("cbt_user_id");
    localStorage.removeItem("cbt_user");
  } catch (error) {
    log.error("Failed to clear persisted auth", error);
  }
};

/**
 * Clears the persisted token everywhere it might live: localStorage (web) and
 * the Stronghold vault (native). Used by the session-invalidation paths
 * (validateToken failure, initAuth failure) so a rejected token can't survive
 * a refresh. Never throws — both sides degrade gracefully.
 */
const purgeStoredToken = async (): Promise<void> => {
  clearPersistedAuth();
  if (isTauri()) {
    await removeToken();
    await removeIdentity();
  }
};

export const useAuthStore = create<AuthState>((set) => ({
  // Web hydrates synchronously from localStorage (unchanged behavior). Tauri
  // starts empty — the encrypted token is loaded asynchronously by initAuth().
  token: useLocalStorageAuth ? localStorage.getItem("cbt_token") : null,
  userId: useLocalStorageAuth ? localStorage.getItem("cbt_user_id") : null,
  // safeJsonParse guards against a corrupted `cbt_user` entry crashing bootstrap.
  user: useLocalStorageAuth
    ? safeJsonParse<User | null>(localStorage.getItem("cbt_user"), null, "cbt_user")
    : null,
  isAuthenticated: useLocalStorageAuth ? !!localStorage.getItem("cbt_token") : false,
  isLoading: false,
  error: null,
  // Web is fully hydrated already; Tauri must wait for initAuth() to read the
  // encrypted vault before protected routes can trust isAuthenticated.
  initialized: !isTauri(),

  login: async (nis, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post("/auth/login", { nis, password });
      const { token, userId, user } = response.data;

      if (isTauri()) {
        // Native: persist the JWT + identity encrypted-at-rest in Stronghold,
        // NOT in localStorage. These never throw — on failure the in-memory
        // session below still works for this run; a restart re-prompts login.
        await saveToken(token);
        await saveIdentity(userId, user);
      } else if (isBrowser) {
        // Web: unchanged — plaintext localStorage (no Stronghold available).
        localStorage.setItem("cbt_token", token);
        localStorage.setItem("cbt_user_id", userId);
        localStorage.setItem("cbt_user", JSON.stringify(user));
      }

      set({
        token,
        userId,
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        // A successful login is itself a completed hydration; flip the flag so
        // protected routes render immediately even if initAuth() hasn't run.
        initialized: true,
      });
      return true;
    } catch (error) {
      const errorMessage = getErrorMessage(
        error,
        "Login gagal. NIS atau Password salah."
      );
      log.error("Login failed", error, { nis, ...toErrorContext(error) });
      set({ isLoading: false, error: errorMessage });
      return false;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      // Disconnect the socket before clearing credentials so the backend's
      // disconnect handler fires immediately and the dashboard online count drops.
      disconnectSocket();
      // Native: delete the encrypted token from Stronghold so the next
      // participant on this shared workstation can't inherit the session.
      // removeToken never throws; the in-memory clear below runs regardless.
      if (isTauri()) {
        await removeToken();
        await removeIdentity();
      }

      // Purge offline answer cache so the next participant on this machine
      // starts with a clean slate (no cross-participant answer leakage).
      await clearLocalDbAnswers();
      clearPersistedAuth();

      set({
        token: null,
        userId: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      // Even on failure, force the in-memory session closed so the user is not
      // left in a half-authenticated state.
      log.error("Logout encountered an error", error);
      set({
        token: null,
        userId: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  validateToken: async () => {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ isAuthenticated: false });
      return false;
    }

    try {
      const response = await api.get("/auth/validate", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 200) {
        set({ isAuthenticated: true });
        return true;
      }

      throw new Error(`Unexpected validate status: ${response.status}`);
    } catch (error) {
      log.warn("Token validation failed — clearing session", toErrorContext(error));
      await purgeStoredToken();
      set({
        token: null,
        userId: null,
        user: null,
        isAuthenticated: false,
      });
      return false;
    }
  },

  initAuth: async () => {
    // Idempotent: a second call (hot-reload, test setup) must not re-open the
    // vault or clobber a session that a login already established.
    if (useAuthStore.getState().initialized) return;

    // Web is already hydrated synchronously in the initializer above; just mark
    // init complete (no extra loader, no behavior change for web users).
    if (!isTauri()) {
      set({ initialized: true });
      return;
    }

    // Migration: a pre-Stronghold native build stored the token in localStorage.
    // Purge any stale plaintext entry so old credentials don't linger (#129).
    clearPersistedAuth();

    try {
      const token = await getToken();

      // A login may have completed while the vault was being read — don't
      // clobber that fresh session with the (older/empty) vault contents.
      if (useAuthStore.getState().token) {
        set({ initialized: true });
        return;
      }

      if (!token) {
        // No stored token (fresh install, prior logout, or unreadable vault):
        // a clean logged-out start. Not an error.
        set({ token: null, isAuthenticated: false, initialized: true });
        return;
      }

      // Restore the FULL session (token + identity) so the dashboard shows the
      // participant's real name/NIS after a restart, then confirm with the server.
      const identity = await getIdentity();
      set({
        token,
        userId: identity?.userId ?? null,
        user: identity?.user ?? null,
        isAuthenticated: true,
        initialized: true,
      });

      const valid = await useAuthStore.getState().validateToken();
      if (!valid) {
        // validateToken() already purged the token + cleared session on failure.
        // Surface a friendly, non-fatal message; the user simply logs in again.
        set({ error: "Sesi berakhir. Silakan login kembali." });
      }
    } catch (error) {
      // Stronghold unlock failure or unexpected error: never crash the app —
      // fall back to a logged-out state with a friendly message.
      log.error("Auth hydration failed — starting logged out", error);
      set({
        token: null,
        userId: null,
        user: null,
        isAuthenticated: false,
        initialized: true,
        error: "Tidak dapat membuka penyimpanan aman. Silakan login kembali.",
      });
    }
  },
}));
