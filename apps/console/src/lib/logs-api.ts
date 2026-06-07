/**
 * Azhura CBT Console — Admin Log Viewer API client (#18).
 *
 * Typed wrapper over `GET /admin/logs`. The backend returns a paginated
 * {@link LogPage}; the realtime tail arrives separately over the `log-entry`
 * socket event (see `useLogStream`).
 */

import api from "./api";
import type { LogPage, LogQuery } from "@azhura/shared";

export const logsApi = {
  /** Fetches a filtered, paginated page of persisted logs (newest first). */
  async query(params: LogQuery): Promise<LogPage> {
    const { data } = await api.get<LogPage>("/admin/logs", { params });
    return data;
  },
};
