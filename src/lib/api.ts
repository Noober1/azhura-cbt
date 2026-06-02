/**
 * Azhura CBT App - HTTP API Client
 *
 * A pre-configured axios instance shared across the app. It transparently:
 * - Attaches the current JWT (from the auth store) to every outgoing request.
 * - Logs request failures with structured context for easy tracing.
 * - Performs an automatic logout + redirect on `401 Unauthorized` responses.
 *
 * In mock mode (`VITE_USE_MOCK=true`) these requests are intercepted by MSW;
 * otherwise they hit the real backend at `VITE_API_BASE_URL`.
 */

import axios from "axios";
import { useAuthStore } from "../stores/auth";
import { createLogger } from "./logger";
import { toErrorContext } from "./errors";

const log = createLogger("API");

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  headers: { "Content-Type": "application/json" },
});

/**
 * Request interceptor: injects the bearer token when available.
 * A failure here is almost always a client-side config error, so we log it
 * with context and reject rather than letting it surface as an opaque rejection.
 */
api.interceptors.request.use(
  (config) => {
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
      log.warn("Unauthorized response — logging out", toErrorContext(error));
      await useAuthStore.getState().logout();
      if (typeof window !== "undefined") window.location.hash = "/login";
    } else {
      log.error("Request failed", error, toErrorContext(error));
    }

    return Promise.reject(error);
  }
);

export default api;
