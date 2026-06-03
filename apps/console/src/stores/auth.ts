/**
 * Azhura CBT Console — Authentication Store (Zustand)
 *
 * Owns the admin session (JWT, identity, role). The console is admin-gated: a
 * successful credential check that is NOT an admin is rejected client-side with
 * a clear message (the backend independently enforces this on every endpoint).
 *
 * Session is persisted to localStorage so a refresh keeps the user signed in.
 * Keys are namespaced (`console_*`) to avoid colliding with the student client
 * if both happen to share an origin during local testing.
 */

import { create } from "zustand";
import axios from "axios";
import { decodeJwt, isExpired, type UserRole } from "../lib/jwt";
import { getErrorMessage } from "../lib/errors";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

const TOKEN_KEY = "console_token";
const USER_KEY = "console_user";
const ROLE_KEY = "console_role";

export interface ConsoleUser {
  id: string;
  nis: string;
  name: string;
}

interface AuthState {
  token: string | null;
  user: ConsoleUser | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  /** Authenticates and enforces the admin-only gate. @returns `true` on success. */
  login: (nis: string, password: string) => Promise<boolean>;
  /** Clears the session and persisted credentials. */
  logout: () => void;
  /** Clears any surfaced login error. */
  clearError: () => void;
}

const isBrowser = typeof window !== "undefined";

function readPersisted(): Pick<AuthState, "token" | "user" | "role"> {
  if (!isBrowser) return { token: null, user: null, role: null };
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return { token: null, user: null, role: null };

  // Drop an expired token at boot so the app starts from a clean /login.
  const claims = decodeJwt(token);
  if (!claims || isExpired(claims)) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ROLE_KEY);
    return { token: null, user: null, role: null };
  }

  let user: ConsoleUser | null = null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    user = raw ? (JSON.parse(raw) as ConsoleUser) : null;
  } catch {
    user = null;
  }
  return { token, user, role: (localStorage.getItem(ROLE_KEY) as UserRole) || claims.role };
}

function persist(token: string, user: ConsoleUser, role: UserRole): void {
  if (!isBrowser) return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(ROLE_KEY, role);
}

function clearPersisted(): void {
  if (!isBrowser) return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ROLE_KEY);
}

const initial = readPersisted();

export const useAuthStore = create<AuthState>((set) => ({
  token: initial.token,
  user: initial.user,
  role: initial.role,
  isAuthenticated: !!initial.token,
  isLoading: false,
  error: null,

  login: async (nis, password) => {
    set({ isLoading: true, error: null });
    try {
      // Use a bare axios call (not the shared instance) so the 401 interceptor's
      // redirect-to-login never fires during the login flow itself.
      const res = await axios.post(`${API_BASE}/auth/login`, { nis, password });
      const { token, user } = res.data as { token: string; user: ConsoleUser };

      const claims = decodeJwt(token);
      if (!claims) {
        set({ isLoading: false, error: "Token tidak valid dari server." });
        return false;
      }
      if (claims.role !== "admin") {
        set({
          isLoading: false,
          error: "Akun ini bukan admin. Panel ini khusus admin.",
        });
        return false;
      }

      persist(token, user, claims.role);
      set({
        token,
        user,
        role: claims.role,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      return true;
    } catch (error) {
      set({
        isLoading: false,
        error: getErrorMessage(error, "Login gagal. NIS atau password salah."),
      });
      return false;
    }
  },

  logout: () => {
    clearPersisted();
    set({
      token: null,
      user: null,
      role: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));
