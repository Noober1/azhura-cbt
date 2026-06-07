/**
 * Azhura CBT Backend — Admin System Settings Routes
 *
 * Admin-only endpoints for reading and updating global application settings.
 * Settings are stored in the `settings` table as key/value text rows and
 * projected onto a strongly-typed `SystemSettings` object by the registry. The
 * cached read lives in `settings-service.ts` so non-route modules (e.g. the
 * socket layer reading `chatEnabled`, #17) can consult settings too.
 *
 * Endpoints (all under `/api/admin`):
 * - `GET  /admin/settings` — return the full settings object (defaults applied).
 * - `PATCH /admin/settings` — partial upsert; only provided keys are changed.
 *
 * Authorization note: this module follows the same flat global-admin model as
 * the other admin routes — `requireAdmin` enforces that only `role=admin` users
 * can read or write settings. If a multi-tenant model is introduced later, add
 * tenant-scoping here.
 */

import { Elysia, t } from "elysia";
import { db, schema } from "../../db";
import { authPlugin } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { createLogger } from "../../lib/logger";
import { SETTING_KEYS, serialize } from "../../lib/settings-registry";
import type { SystemSettings } from "../../lib/settings-registry";
import { readSettings, invalidateSettingsCache } from "../../lib/settings-service";
import { notifyChatEnabledChanged } from "../../lib/chat-events";

const { settings } = schema;

const log = createLogger("AdminSettings");

export const adminSettingsRoutes = new Elysia({ prefix: "/admin" })
  .use(authPlugin)
  .onBeforeHandle(requireAdmin)

  /**
   * GET /api/admin/settings
   * Returns the full system settings object. Missing DB keys resolve to defaults.
   */
  .get("/settings", async () => {
    return readSettings();
  })

  /**
   * PATCH /api/admin/settings
   * Partially updates settings: only the provided keys are upserted. Unknown
   * keys in the body are silently ignored (Elysia strips them via the schema).
   * Returns the full refreshed settings object after the write.
   *
   * @throws {ValidationError} when a value fails the type/range constraints.
   */
  .patch(
    "/settings",
    async ({ body }) => {
      const previous = await readSettings();
      const now = Date.now();
      const changedKeys: string[] = [];

      for (const key of SETTING_KEYS) {
        const typedKey = key as keyof SystemSettings;
        const value = (body as Partial<SystemSettings>)[typedKey];
        if (value === undefined) continue;

        const serialized = serialize(typedKey, value);
        await db
          .insert(settings)
          .values({ key, value: serialized, updatedAt: now })
          .onDuplicateKeyUpdate({ set: { value: serialized, updatedAt: now } });

        changedKeys.push(key);
      }

      invalidateSettingsCache();
      const updated = await readSettings();
      log.info("Settings updated", { keys: changedKeys });

      // Apply a chat on/off toggle live (#17): only when it actually changed, so
      // the socket layer joins/leaves room members and pushes `chat:config`.
      if (updated.chatEnabled !== previous.chatEnabled) {
        notifyChatEnabledChanged(updated.chatEnabled);
      }

      return updated;
    },
    {
      body: t.Object({
        schoolName: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        schoolAddress: t.Optional(t.String({ maxLength: 500 })),
        defaultExamDurationMinutes: t.Optional(
          t.Integer({ minimum: 1, maximum: 480 })
        ),
        defaultPassingGrade: t.Optional(
          t.Integer({ minimum: 0, maximum: 100 })
        ),
        antiCheatEnabled: t.Optional(t.Boolean()),
        chatEnabled: t.Optional(t.Boolean()),
      }),
    }
  );
