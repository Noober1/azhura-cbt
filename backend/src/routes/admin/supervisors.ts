/**
 * Azhura CBT Backend — Admin Supervisor Account Routes (#139)
 *
 * Admin-only CRUD for supervisor accounts, gated to the `admin` role via
 * {@link requireAdmin}. Scoped to `role = 'supervisor'` rows only — student
 * provisioning lives in `students.ts`. Supervisors have no group/batch (they
 * proctor across exams), so `groupId` is always `null`. Endpoints (under
 * `/api/admin`):
 * - `POST   /admin/supervisors`              — create (password hashed, NIS unique).
 * - `PUT    /admin/supervisors/:id`          — partial profile update (nis/name/isActive).
 * - `PATCH  /admin/supervisors/:id/password` — reset password.
 * - `DELETE /admin/supervisors/:id`          — delete the account.
 *
 * `GET /admin/supervisors` is intentionally NOT defined here — it already exists
 * in `exam-supervisors.ts` as the active-supervisor picker for assignment.
 *
 * Passwords are always bcrypt-hashed and never returned. NIS is the global login
 * identity across ALL roles, so uniqueness is enforced against the whole `users`
 * table before write (the column is also UNIQUE as a backstop).
 */

import { Elysia, t } from "elysia";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { authPlugin } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { createLogger } from "../../lib/logger";
import type { SupervisorAccount } from "@azhura/shared";

const { users } = schema;

const log = createLogger("AdminSupervisor");

const BCRYPT_ROUNDS = 10;
const SUPERVISOR_ROLE = "supervisor" as const;

const tinyToBool = (v: number): boolean => v === 1;

/**
 * Ensures `nis` is free across ALL roles (it's the global login identity). When
 * `exceptId` is given (update), a match on that same row is allowed (renaming to
 * the current value is a no-op).
 * @throws {ConflictError} when the NIS belongs to a different user.
 */
async function assertNisAvailable(nis: string, exceptId?: string): Promise<void> {
  const found = await db.query.users.findFirst({
    columns: { id: true },
    where: eq(users.nis, nis),
  });
  if (found && found.id !== exceptId) {
    throw new ConflictError("NIS sudah digunakan.");
  }
}

/**
 * Confirms a supervisor row exists; @throws {NotFoundError} when missing or when
 * the row exists but is not a supervisor (e.g. a student/admin id).
 */
async function assertSupervisorExists(id: string): Promise<void> {
  const existing = await db.query.users.findFirst({
    columns: { id: true, role: true },
    where: eq(users.id, id),
  });
  if (!existing || existing.role !== SUPERVISOR_ROLE) {
    throw new NotFoundError("Pengawas tidak ditemukan.");
  }
}

/** Supervisor detail. Scoped to `role = 'supervisor'`; never returns the hash. */
async function getSupervisorDetail(id: string): Promise<SupervisorAccount> {
  const [row] = await db
    .select({
      id: users.id,
      nis: users.nis,
      name: users.name,
      initialPassword: users.initialPassword,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!row) throw new NotFoundError("Pengawas tidak ditemukan.");

  return {
    id: row.id,
    nis: row.nis,
    name: row.name,
    isActive: tinyToBool(row.isActive),
    initialPassword: row.initialPassword ?? null,
    createdAt: row.createdAt.getTime(),
  };
}

export const adminSupervisorRoutes = new Elysia({ prefix: "/admin" })
  .use(authPlugin)
  .onBeforeHandle(requireAdmin)

  /**
   * POST /api/admin/supervisors
   * Creates a supervisor. Password is bcrypt-hashed; NIS must be globally unique.
   * Supervisors have no group/batch, so `groupId` is set to `null`.
   * @throws {ConflictError} when the NIS is already taken.
   */
  .post(
    "/supervisors",
    async ({ body, set }) => {
      const nis = body.nis.trim();

      await assertNisAvailable(nis);

      const id = randomUUID();
      const plainPassword = body.password;
      const password = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

      await db.insert(users).values({
        id,
        nis,
        name: body.name.trim(),
        password,
        initialPassword: plainPassword,
        role: SUPERVISOR_ROLE,
        groupId: null,
        isActive: 1,
      });

      log.info("Supervisor created", { id, nis });
      set.status = 201;
      return getSupervisorDetail(id);
    },
    {
      body: t.Object({
        nis: t.String({ minLength: 5, maxLength: 20 }),
        name: t.String({ minLength: 1, maxLength: 100 }),
        // bcrypt only hashes the first 72 bytes — cap to avoid silent truncation.
        password: t.String({ minLength: 6, maxLength: 72 }),
      }),
    }
  )

  /**
   * PUT /api/admin/supervisors/:id
   * Partial profile update (NIS / name / active flag). Password changes go through
   * the dedicated `/password` route. Only fields present in the body are changed.
   * @throws {NotFoundError} when no supervisor matches.
   * @throws {ConflictError} when a new NIS is already taken.
   */
  .put(
    "/supervisors/:id",
    async ({ params, body }) => {
      const { id } = params;
      await assertSupervisorExists(id);

      if (body.nis !== undefined) await assertNisAvailable(body.nis.trim(), id);

      const patch: Partial<typeof users.$inferInsert> = {};
      if (body.nis !== undefined) patch.nis = body.nis.trim();
      if (body.name !== undefined) patch.name = body.name.trim();
      if (body.isActive !== undefined) patch.isActive = body.isActive ? 1 : 0;

      if (Object.keys(patch).length > 0) {
        await db.update(users).set(patch).where(eq(users.id, id));
      }

      log.info("Supervisor updated", { id });
      return getSupervisorDetail(id);
    },
    {
      body: t.Object({
        nis: t.Optional(t.String({ minLength: 5, maxLength: 20 })),
        name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
        isActive: t.Optional(t.Boolean()),
      }),
    }
  )

  /**
   * PATCH /api/admin/supervisors/:id/password
   * Resets a supervisor's password. Re-hashes and stores the plaintext in
   * `initialPassword` for credential distribution (mirrors student behavior).
   * @throws {NotFoundError} when no supervisor matches.
   */
  .patch(
    "/supervisors/:id/password",
    async ({ params, body }) => {
      const { id } = params;
      await assertSupervisorExists(id);

      const plainPassword = body.password;
      const password = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

      await db
        .update(users)
        .set({ password, initialPassword: plainPassword })
        .where(eq(users.id, id));

      log.info("Supervisor password reset", { id });
      return getSupervisorDetail(id);
    },
    {
      body: t.Object({
        // bcrypt only hashes the first 72 bytes — cap to avoid silent truncation.
        password: t.String({ minLength: 6, maxLength: 72 }),
      }),
    }
  )

  /**
   * DELETE /api/admin/supervisors/:id
   * Deletes a supervisor account. Any `exam_supervisors` assignment rows are
   * removed automatically via the FK `ON DELETE CASCADE` on `user_id`.
   * @throws {NotFoundError} when no supervisor matches.
   */
  .delete("/supervisors/:id", async ({ params }) => {
    const { id } = params;
    await assertSupervisorExists(id);

    await db.delete(users).where(eq(users.id, id));
    log.info("Supervisor deleted", { id });
    return { success: true };
  });
