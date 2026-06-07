/**
 * Azhura CBT Console — First-run Setup API client.
 *
 * Talks to the public `/setup` endpoints. Uses a bare axios call (not the shared
 * authenticated instance) because there is no token yet during first-run setup,
 * and the 401 interceptor's redirect-to-login must not fire here.
 */

import axios from "axios";
import type { SetupStatus, SetupRequest, SetupResult } from "@azhura/shared";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export const setupApi = {
  /** Whether the system still needs first-run setup (no admin exists yet). */
  async getStatus(): Promise<SetupStatus> {
    const { data } = await axios.get<SetupStatus>(`${API_BASE}/setup/status`);
    return data;
  },

  /** Creates the first admin and records school info. Throws on 409/validation. */
  async submit(payload: SetupRequest): Promise<SetupResult> {
    const { data } = await axios.post<SetupResult>(`${API_BASE}/setup`, payload);
    return data;
  },
};
