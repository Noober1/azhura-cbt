/**
 * Azhura CBT Backend — First-run Setup Routes (public, unauthenticated)
 *
 * Provisions a brand-new installation. The system is "uninitialized" while no
 * admin account exists; the console detects this and shows a setup wizard
 * instead of the login page.
 *
 * Endpoints (under `/api`):
 * - `GET  /setup/status` — `{ needsSetup }`; true while there is no admin.
 * - `POST /setup`        — create the first admin + record school info.
 *
 * Security: `POST /setup` self-locks. Once any admin exists it returns 409, so
 * leaving the route mounted in production cannot be used to mint extra admins.
 * Both endpoints are intentionally public — there is no credential to present
 * before the first admin is created.
 */

import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "../db";
import { isSetupNeeded } from "../lib/setup-service";
import { serialize } from "../lib/settings-registry";
import { invalidateSettingsCache } from "../lib/settings-service";
import { ConflictError } from "../lib/errors";
import { createLogger } from "../lib/logger";
import { writeEventLog } from "../lib/log-files";

const { users, settings } = schema;

const log = createLogger("Setup");

const BCRYPT_ROUNDS = 10;

/** Counts admin accounts. A fresh install returns 0. */
async function countAdmins(): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"));
  return rows.length;
}

/** The settings written during first-run setup. */
interface SetupSettings {
  name: string;
  address: string;
  /** Optional initial public-chat toggle; left untouched (default) when omitted. */
  chatEnabled?: boolean;
}

/** Persists school info (and an optional chat toggle) into the settings table. */
async function writeSetupSettings({ name, address, chatEnabled }: SetupSettings): Promise<void> {
  const now = Date.now();
  const entries: [string, string][] = [
    ["schoolName", serialize("schoolName", name)],
    ["schoolAddress", serialize("schoolAddress", address)],
  ];
  if (chatEnabled !== undefined) {
    entries.push(["chatEnabled", serialize("chatEnabled", chatEnabled)]);
  }
  for (const [key, value] of entries) {
    await db
      .insert(settings)
      .values({ key, value, updatedAt: now })
      .onDuplicateKeyUpdate({ set: { value, updatedAt: now } });
  }
  invalidateSettingsCache();
}

export const setupRoutes = new Elysia({ prefix: "/setup" })
  /**
   * GET /api/setup/status
   * Public. Reports whether first-run setup is still required.
   */
  .get("/status", async () => {
    const needsSetup = isSetupNeeded(await countAdmins());
    return { needsSetup };
  })

  /**
   * POST /api/setup
   * Creates the first admin and records school info. Self-locks: once any admin
   * exists this returns 409. A duplicate NIS also returns 409.
   */
  .post(
    "/",
    async ({ body }) => {
      // Self-lock: refuse if the system is already initialized.
      if (!isSetupNeeded(await countAdmins())) {
        throw new ConflictError("Setup sudah selesai. Admin sudah ada.");
      }

      const adminNis = body.adminNis.trim();
      const adminName = body.adminName.trim();

      // Reject a NIS already taken by any account (e.g. a seeded student) up
      // front, so the error is a clear 409 rather than a raw duplicate-key 500.
      const existing = await db.query.users.findFirst({
        columns: { id: true },
        where: eq(users.nis, adminNis),
      });
      if (existing) {
        throw new ConflictError("NIS sudah dipakai. Gunakan NIS lain untuk admin.");
      }

      const id = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(body.adminPassword, BCRYPT_ROUNDS);

      await db.insert(users).values({
        id,
        nis: adminNis,
        password: passwordHash,
        name: adminName,
        role: "admin",
        isActive: 1,
        groupId: null,
      });

      await writeSetupSettings({
        name: body.schoolName.trim(),
        address: body.schoolAddress?.trim() ?? "",
        chatEnabled: body.chatEnabled,
      });

      log.info("First admin provisioned via setup wizard", { userId: id, nis: adminNis });
      // Audit event (#18) — never include the password.
      writeEventLog(
        "setup",
        `Setup awal selesai: admin ${adminNis} dibuat`,
        { nis: adminNis, schoolName: body.schoolName.trim() },
        { id, role: "admin" }
      );

      return { success: true as const };
    },
    {
      body: t.Object({
        schoolName: t.String({ minLength: 1, maxLength: 200 }),
        schoolAddress: t.Optional(t.String({ maxLength: 500 })),
        adminName: t.String({ minLength: 1, maxLength: 100 }),
        adminNis: t.String({ minLength: 5, maxLength: 20 }),
        adminPassword: t.String({ minLength: 6, maxLength: 100 }),
        chatEnabled: t.Optional(t.Boolean()),
      }),
    }
  );
