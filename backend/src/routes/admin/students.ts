/**
 * Azhura CBT Backend - Admin Student Routes (Drizzle)
 *
 * Admin-only CRUD for student accounts, gated to the `admin` role via
 * {@link requireAdmin}. Scoped to `role = 'student'` rows only — supervisor/admin
 * provisioning is a separate concern (seed-managed for now). Endpoints (under
 * `/api/admin`):
 * - `GET    /admin/students`            — paginated; search by NIS/name; group filter.
 * - `GET    /admin/students/:studentId` — single student (+ group name).
 * - `POST   /admin/students`            — create (password hashed, NIS unique).
 * - `PATCH  /admin/students/:studentId` — partial update (optional password change).
 * - `DELETE /admin/students/:studentId` — delete; blocked if the student has exam
 *                                         history (deactivate instead).
 *
 * Passwords are always bcrypt-hashed and never returned. NIS uniqueness is
 * enforced before write (the column is also UNIQUE as a backstop).
 */

import { Elysia, t } from "elysia";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { and, asc, eq, like, or, sql } from "drizzle-orm";
import { db, schema } from "../../db";
import { authPlugin } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors";
import { notifyDashboardStats } from "./dashboard";
import { createLogger } from "../../lib/logger";

const { users, groups, examSessions } = schema;

const log = createLogger("AdminStudent");

const BCRYPT_ROUNDS = 10;
const STUDENT_ROLE = "student" as const;

const tinyToBool = (v: number): boolean => v === 1;
const boolToTiny = (v: boolean): number => (v ? 1 : 0);

/**
 * Ensures `nis` is free. When `exceptId` is given (update), a match on that same
 * row is allowed (renaming to the current value is a no-op).
 * @throws {ConflictError} when the NIS belongs to a different user.
 */
async function assertNisAvailable(nis: string, exceptId?: string): Promise<void> {
  const found = await db.query.users.findFirst({
    columns: { id: true },
    where: eq(users.nis, nis),
  });
  if (found && found.id !== exceptId) {
    throw new ConflictError("NIS sudah digunakan oleh siswa lain.");
  }
}

/**
 * Validates that a non-null group id exists. `null` means "no group" and is
 * always allowed; `undefined` (field omitted on PATCH) is skipped by the caller.
 * @throws {BadRequestError} when the group id does not exist.
 */
async function assertGroupExists(groupId: string | null): Promise<void> {
  if (!groupId) return;
  const group = await db.query.groups.findFirst({
    columns: { id: true },
    where: eq(groups.id, groupId),
  });
  if (!group) throw new BadRequestError(`Group tidak ditemukan: ${groupId}`);
}

/** Student detail (+ joined group name). Scoped to `role = 'student'`. */
async function getStudentDetail(studentId: string) {
  const [row] = await db
    .select({
      id: users.id,
      nis: users.nis,
      name: users.name,
      groupId: users.groupId,
      groupName: groups.name,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(groups, eq(groups.id, users.groupId))
    .where(and(eq(users.id, studentId), eq(users.role, STUDENT_ROLE)))
    .limit(1);

  if (!row) throw new NotFoundError("Siswa tidak ditemukan.");

  return {
    id: row.id,
    nis: row.nis,
    name: row.name,
    groupId: row.groupId,
    groupName: row.groupName,
    isActive: tinyToBool(row.isActive),
    createdAt: row.createdAt.getTime(),
  };
}

/** Confirms a student row exists; @throws {NotFoundError} otherwise. */
async function assertStudentExists(studentId: string): Promise<void> {
  const existing = await db.query.users.findFirst({
    columns: { id: true, role: true },
    where: eq(users.id, studentId),
  });
  if (!existing || existing.role !== STUDENT_ROLE) {
    throw new NotFoundError("Siswa tidak ditemukan.");
  }
}

export const adminStudentRoutes = new Elysia({ prefix: "/admin" })
  .use(authPlugin)
  .onBeforeHandle(requireAdmin)

  /**
   * GET /api/admin/students?q=&groupId=&page=&limit=
   * Paginated listing of students. `q` matches NIS or name; `groupId` filters to
   * one group. Never returns password hashes.
   * @returns `{ data, meta: { total, page, limit } }`
   */
  .get(
    "/students",
    async ({ query }) => {
      const page = Math.max(1, query.page ?? 1);
      const limit = Math.min(100, Math.max(1, query.limit ?? 20));
      const offset = (page - 1) * limit;
      const search = query.q?.trim();

      const filters = [eq(users.role, STUDENT_ROLE)];
      if (search) {
        filters.push(
          or(like(users.nis, `%${search}%`), like(users.name, `%${search}%`))!
        );
      }
      if (query.groupId) filters.push(eq(users.groupId, query.groupId));
      const where = and(...filters);

      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(users)
        .where(where);

      const rows = await db
        .select({
          id: users.id,
          nis: users.nis,
          name: users.name,
          groupId: users.groupId,
          groupName: groups.name,
          isActive: users.isActive,
          createdAt: users.createdAt,
        })
        .from(users)
        .leftJoin(groups, eq(groups.id, users.groupId))
        .where(where)
        .orderBy(asc(users.name))
        .limit(limit)
        .offset(offset);

      return {
        data: rows.map((r) => ({
          id: r.id,
          nis: r.nis,
          name: r.name,
          groupId: r.groupId,
          groupName: r.groupName,
          isActive: tinyToBool(r.isActive),
          createdAt: r.createdAt.getTime(),
        })),
        meta: { total: Number(total), page, limit },
      };
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        groupId: t.Optional(t.String()),
        page: t.Optional(t.Number({ minimum: 1 })),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
    }
  )

  /**
   * GET /api/admin/students/:studentId
   * @throws {NotFoundError} when no student matches.
   */
  .get("/students/:studentId", ({ params }) => getStudentDetail(params.studentId))

  /**
   * POST /api/admin/students
   * Creates a student. Password is bcrypt-hashed; NIS must be unique; an optional
   * `groupId` must reference an existing group.
   * @throws {ConflictError}   when the NIS is already taken.
   * @throws {BadRequestError} when `groupId` does not exist.
   */
  .post(
    "/students",
    async ({ body, set }) => {
      const nis = body.nis.trim();
      const groupId = body.groupId ?? null;

      await assertNisAvailable(nis);
      await assertGroupExists(groupId);

      const id = randomUUID();
      const password = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

      await db.insert(users).values({
        id,
        nis,
        name: body.name.trim(),
        password,
        role: STUDENT_ROLE,
        groupId,
        isActive: boolToTiny(body.isActive ?? true),
      });

      log.info("Student created", { id, nis });
      void notifyDashboardStats().catch(() => {});
      set.status = 201;
      return getStudentDetail(id);
    },
    {
      body: t.Object({
        nis: t.String({ minLength: 5, maxLength: 20 }),
        name: t.String({ minLength: 1, maxLength: 100 }),
        // bcrypt only hashes the first 72 bytes — cap to avoid silent truncation.
        password: t.String({ minLength: 6, maxLength: 72 }),
        groupId: t.Optional(t.Nullable(t.String())),
        isActive: t.Optional(t.Boolean()),
      }),
    }
  )

  /**
   * PATCH /api/admin/students/:studentId
   * Partial update. Supplying `password` re-hashes it; supplying `groupId: null`
   * unassigns the group. Only fields present in the body are changed.
   * @throws {NotFoundError}   when no student matches.
   * @throws {ConflictError}   when a new NIS is already taken.
   * @throws {BadRequestError} when a new `groupId` does not exist.
   */
  .patch(
    "/students/:studentId",
    async ({ params, body }) => {
      const { studentId } = params;
      await assertStudentExists(studentId);

      if (body.nis !== undefined) await assertNisAvailable(body.nis.trim(), studentId);
      if (body.groupId !== undefined) await assertGroupExists(body.groupId);

      const patch: Partial<typeof users.$inferInsert> = {};
      if (body.nis !== undefined) patch.nis = body.nis.trim();
      if (body.name !== undefined) patch.name = body.name.trim();
      if (body.groupId !== undefined) patch.groupId = body.groupId;
      if (body.isActive !== undefined) patch.isActive = boolToTiny(body.isActive);
      if (body.password !== undefined) {
        patch.password = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
      }

      if (Object.keys(patch).length > 0) {
        await db.update(users).set(patch).where(eq(users.id, studentId));
      }

      log.info("Student updated", { id: studentId });
      return getStudentDetail(studentId);
    },
    {
      body: t.Object({
        nis: t.Optional(t.String({ minLength: 5, maxLength: 20 })),
        name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
        password: t.Optional(t.String({ minLength: 6, maxLength: 72 })),
        groupId: t.Optional(t.Nullable(t.String())),
        isActive: t.Optional(t.Boolean()),
      }),
    }
  )

  /**
   * DELETE /api/admin/students/:studentId
   * Deletes a student. Blocked when the student has exam-session history (those
   * sessions reference the user); deactivate the account instead to preserve the
   * audit trail.
   * @throws {NotFoundError}   when no student matches.
   * @throws {BadRequestError} when the student has exam history.
   */
  .delete("/students/:studentId", async ({ params }) => {
    const { studentId } = params;
    await assertStudentExists(studentId);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(examSessions)
      .where(eq(examSessions.userId, studentId));

    if (Number(count) > 0) {
      throw new BadRequestError(
        "Siswa memiliki riwayat sesi ujian dan tidak dapat dihapus. " +
          "Nonaktifkan akun sebagai gantinya."
      );
    }

    await db.delete(users).where(eq(users.id, studentId));
    log.info("Student deleted", { id: studentId });
    void notifyDashboardStats().catch(() => {});
    return { success: true };
  });
