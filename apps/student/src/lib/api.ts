/**
 * Azhura CBT App - HTTP API Client
 *
 * A pre-configured axios instance shared across the app. It transparently:
 * - Resolves the base URL from the config store (serverUrl) if set, otherwise
 *   falls back to VITE_API_BASE_URL. This lets the first-run wizard (#43) and
 *   hidden settings panel (#42) reconfigure the target server without a rebuild.
 * - Attaches the current JWT (from the auth store) to every outgoing request.
 * - Logs request failures with structured context for easy tracing.
 * - Performs an automatic logout + redirect on `401 Unauthorized` responses.
 */

import axios from "axios";
import { useAuthStore } from "../stores/auth";
import { useConfigStore } from "../stores/config";
import { useExamStore } from "../stores/exam";
import { createLogger } from "./logger";
import { toErrorContext } from "./errors";
import { toast } from "sonner";

const log = createLogger("API");

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  headers: { "Content-Type": "application/json" },
});

/**
 * Request interceptor: resolves the dynamic serverUrl from config store, then
 * injects the bearer token. Config store takes precedence over the env default
 * so the first-run wizard (#43) / hidden settings (#42) work without a rebuild.
 */
api.interceptors.request.use(
  (config) => {
    const { serverUrl } = useConfigStore.getState();
    if (serverUrl) {
      config.baseURL = `${serverUrl}/api`;
    }
    const token = useAuthStore.getState().token;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    log.error("Request setup failed", error, toErrorContext(error));
    return Promise.reject(error);
  }
);

/**
 * Response interceptor: passes successful responses through untouched, and on
 * failure logs structured context (status, url, method). On `401` it clears the
 * session and redirects to login so stale tokens cannot wedge the UI.
 */
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;

    if (status === 401) {
      // A 401 on the login request itself is just wrong credentials (handled
      // inline by the login form). Only surface a "session expired" notice when
      // the user WAS authenticated and a later request was rejected (idle > TTL),
      // so the redirect doesn't feel like a silent bug (#147).
      const requestUrl = axios.isAxiosError(error) ? error.config?.url ?? "" : "";
      const wasAuthenticated = Boolean(useAuthStore.getState().token);
      const isLoginAttempt = requestUrl.includes("/auth/login");

      // An involuntary 401 mid-exam (transient token blip, single-session kick)
      // must not wipe the offline answer cache — the student may resume. A fresh
      // attempt clears it at session start, so isolation is still guaranteed.
      const midExam = Boolean(useExamStore.getState().examSessionId);

      log.warn("Unauthorized response — logging out", toErrorContext(error));
      await useAuthStore.getState().logout({ preserveOfflineAnswers: midExam });

      if (wasAuthenticated && !isLoginAttempt) {
        toast.error(
          "Sesi berakhir karena tidak aktif terlalu lama. Silakan masuk kembali.",
          { id: "session-expired" }
        );
      }
      if (typeof window !== "undefined") window.location.hash = "/login";
    } else {
      log.error("Request failed", error, toErrorContext(error));
    }

    return Promise.reject(error);
  }
);

export default api;
