/**
 * Azhura CBT App - Authentication Store (Zustand)
 *
 * Owns the student's authentication state (JWT token, user identity) and the
 * login/logout/token-validation lifecycle. State is hydrated from and persisted
 * to `localStorage` so a refresh or app restart keeps the session.
 *
 * Tauri note: token persistence should additionally use the Stronghold plugin
 * for encrypted-at-rest storage in production (see `// TODO` markers).
 */

import { create } from "zustand";
import { User } from "../types";
import api from "../lib/api";
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
  /** Authenticates with NIS + password. @returns `true` on success. */
  login: (nis: string, password: string) => Promise<boolean>;
  /** Clears all session state and persisted credentials. */
  logout: () => Promise<void>;
  /** Verifies the stored token with the server; auto-logs-out if invalid. */
  validateToken: () => Promise<boolean>;
}

/** @returns `true` when running inside a Tauri WebView (desktop build). */
const isTauri = (): boolean =>
  typeof window !== "undefined" &&
  (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !==
    undefined;

const isBrowser = typeof window !== "undefined";

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

export const useAuthStore = create<AuthState>((set) => ({
  token: isBrowser ? localStorage.getItem("cbt_token") : null,
  userId: isBrowser ? localStorage.getItem("cbt_user_id") : null,
  // safeJsonParse guards against a corrupted `cbt_user` entry crashing bootstrap.
  user: isBrowser
    ? safeJsonParse<User | null>(localStorage.getItem("cbt_user"), null, "cbt_user")
    : null,
  isAuthenticated: isBrowser ? !!localStorage.getItem("cbt_token") : false,
  isLoading: false,
  error: null,

  login: async (nis, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post("/auth/login", { nis, password });
      const { token, userId, user } = response.data;

      if (isBrowser) {
        localStorage.setItem("cbt_token", token);
        localStorage.setItem("cbt_user_id", userId);
        localStorage.setItem("cbt_user", JSON.stringify(user));
      }

      // TODO: In Tauri production, persist the token in Stronghold (encrypted).
      if (isTauri()) {
        log.debug("Stronghold token persistence not yet implemented.");
      }

      set({
        token,
        userId,
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
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
      // TODO: In Tauri production, delete the token from Stronghold.
      if (isTauri()) {
        log.debug("Stronghold token deletion not yet implemented.");
      }

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
      clearPersistedAuth();
      set({
        token: null,
        userId: null,
        user: null,
        isAuthenticated: false,
      });
      return false;
    }
  },
}));
