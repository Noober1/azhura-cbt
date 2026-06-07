/**
 * Azhura CBT Console — Admin Settings API client.
 *
 * Typed wrappers over `GET /admin/settings` and `PATCH /admin/settings`.
 * The backend always returns the full `SystemSettings` object (missing DB keys
 * resolve to server-side defaults), so callers never receive a partial shape.
 */

import api from "./api";
import type { SystemSettings, SystemSettingsInput } from "../types";

export const settingsApi = {
  /** Fetches the current system settings (full object, defaults applied). */
  async get(): Promise<SystemSettings> {
    const { data } = await api.get<SystemSettings>("/admin/settings");
    return data;
  },

  /**
   * Partially updates settings. Only the provided keys are written to the DB.
   * Returns the full refreshed settings after the write.
   */
  async update(input: SystemSettingsInput): Promise<SystemSettings> {
    const { data } = await api.patch<SystemSettings>("/admin/settings", input);
    return data;
  },
};
