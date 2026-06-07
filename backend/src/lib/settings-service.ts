/**
 * Azhura CBT Backend - System settings read cache (service)
 *
 * Owns the cached read of the global `SystemSettings`, decoupled from the admin
 * route so non-route modules (e.g. the socket layer reading `chatEnabled`, #17)
 * can consult current settings without importing a route. The admin settings
 * route writes through `PATCH` and calls {@link invalidateSettingsCache} so reads
 * stay consistent.
 *
 * In-process cache only — a future multi-instance deployment would move this to
 * Redis, but for the single on-premise backend a process cache is sufficient.
 */

import { db, schema } from "../db";
import { projectRows } from "./settings-registry";
import type { SystemSettings } from "./settings-registry";

const { settings } = schema;

let cachedSettings: SystemSettings | null = null;

/** Drops the cache so the next {@link readSettings} reflects the latest DB write. */
export function invalidateSettingsCache(): void {
  cachedSettings = null;
}

/**
 * Returns the full system settings object, defaults applied for absent keys.
 * Cached after the first read; the cache is cleared on every settings write.
 */
export async function readSettings(): Promise<SystemSettings> {
  if (cachedSettings) return cachedSettings;
  const rows = await db.select().from(settings);
  cachedSettings = projectRows(rows);
  return cachedSettings;
}
