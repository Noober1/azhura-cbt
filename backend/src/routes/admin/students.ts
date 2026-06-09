/**
 * Azhura CBT Backend - Admin Student Routes (Drizzle)
 *
 * Admin-only CRUD for student accounts, gated to the `admin` role via
 * {@link requireAdmin}. Scoped to `role = 'student'` rows only — supervisor/admin
 * provisioning is a separate concern (seed-managed for now). Endpoints (under
 * `/api/admin`):
 * - `GET    /admin/students`                  — paginated; search by NIS/name; group filter.
 * - `GET    /admin/students/template`         — download empty import template (.xlsx or .csv).
 * - `GET    /admin/students/:studentId`       — single student (+ group name).
 * - `POST   /admin/students`                  — create (password hashed, NIS unique).
 * - `POST   /admin/students/import`           — dry-run: parse & validate file, return preview.
 * - `POST   /admin/students/import/confirm`   — execute upsert (+ sync deletes) from session.
 * - `PATCH  /admin/students/:studentId`       — partial update (optional password change).
 * - `DELETE /admin/students/:studentId`       — delete; blocked if the student has exam history.
 *
 * Passwords are always bcrypt-hashed and never returned. NIS uniqueness is
 * enforced before write (the column is also UNIQUE as a backstop).
 * Import-generated passwords use 8 rounds (auto-generated, temporary by design).
 */

import { Elysia, t } from "elysia";
import { randomUUID, webcrypto } from "crypto";
import bcrypt from "bcryptjs";
import { and, asc, eq, inArray, like, notInArray, or, sql } from "drizzle-orm";
import { db, schema } from "../../db";
import { authPlugin } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors";
import { notifyDashboardStats } from "./dashboard";
import { createLogger } from "../../lib/logger";
import {
  parseSpreadsheet,
  generateTemplateXlsx,
  generateTemplateCsv,
  XLSX_CONTENT_TYPE,
  CSV_CONTENT_TYPE,
} from "../../lib/spreadsheet";
import { studentImportSessions, canDryRun, markDryRun } from "../../lib/import-session";
import type { StudentImportRow } from "../../lib/import-session";

const { users, groups, examSessions } = schema;

const log = createLogger("AdminStudent");

const BCRYPT_ROUNDS = 10;
/** Reduced rounds for auto-generated import passwords (temporary by design). */
const IMPORT_BCRYPT_ROUNDS = 8;
const STUDENT_ROLE = "student" as const;

/** Generates a random 8-character alphanumeric password (avoids O/0/I/1/l). Uses CSPRNG. */
function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = webcrypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

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
      initialPassword: users.initialPassword,
      groupId: users.groupId,
      groupName: groups.name,
      batch: users.batch,
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
    initialPassword: row.initialPassword ?? null,
    groupId: row.groupId,
    groupName: row.groupName,
    batch: row.batch,
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
          initialPassword: users.initialPassword,
          groupId: users.groupId,
          groupName: groups.name,
          batch: users.batch,
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
          initialPassword: r.initialPassword ?? null,
          groupId: r.groupId,
          groupName: r.groupName,
          batch: r.batch,
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
   * GET /api/admin/students/template?format=xlsx|csv
   * Downloads an empty import template with example data.
   */
  .get(
    "/students/template",
    async ({ query }) => {
      const format = query.format === "csv" ? "csv" : "xlsx";
      const headers = ["nis", "nama", "grup", "batch"];
      const example = { nis: "12345", nama: "Ahmad Faisal", grup: "7A", batch: "1" };

      if (format === "csv") {
        const csv = generateTemplateCsv(headers, example);
        return new Response(csv, {
          headers: {
            "Content-Type": CSV_CONTENT_TYPE,
            "Content-Disposition": 'attachment; filename="template-siswa.csv"',
          },
        });
      }

      const buf = await generateTemplateXlsx(headers, example);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": XLSX_CONTENT_TYPE,
          "Content-Disposition": 'attachment; filename="template-siswa.xlsx"',
        },
      });
    },
    { query: t.Object({ format: t.Optional(t.String()) }) }
  )

  /**
   * POST /api/admin/students/import
   * Accepts a multipart upload (.xlsx or .csv), parses and validates all rows,
   * performs a dry-run (no DB writes), and returns a preview with a session token.
   *
   * For Mode Sync, also identifies students in DB that are absent from the file
   * and splits them into "will delete" vs "skipped (has exam history)".
   *
   * Passwords for new students are pre-hashed here so the confirm step is fast.
   *
   * @throws {BadRequestError} when the file format is wrong or too many rows.
   */
  .post(
    "/students/import",
    async ({ body, user }) => {
      const MAX_ROWS = 1000;
      const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
      const mode = body.mode === "sync" ? "sync" : "import";

      if (!canDryRun(user.userId)) {
        throw new BadRequestError("Terlalu cepat. Tunggu 10 detik sebelum upload ulang.");
      }
      markDryRun(user.userId);

      if (body.file.size > MAX_FILE_BYTES) {
        throw new BadRequestError("Ukuran file melebihi batas 10 MB.");
      }
      const allowedMimes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
        "application/csv",
        "text/plain",
      ];
      if (body.file.type && !allowedMimes.includes(body.file.type)) {
        throw new BadRequestError("Tipe file tidak didukung. Gunakan .xlsx atau .csv.");
      }

      const { rows: rawRows, error: parseError } = await parseSpreadsheet(body.file);
      if (parseError) throw new BadRequestError(parseError);
      if (rawRows.length > MAX_ROWS) {
        throw new BadRequestError(
          `File melebihi batas ${MAX_ROWS} baris. File Anda memiliki ${rawRows.length} baris.`
        );
      }

      // Build group code → ID lookup map (single query for all groups).
      const allGroups = await db.select({ id: groups.id, code: groups.code }).from(groups);
      const groupByCode = new Map(allGroups.map((g) => [g.code.toUpperCase(), g.id]));

      // Validate rows and resolve group IDs. Track duplicate NIS within the file.
      const seenNis = new Map<string, number>(); // nis → first row number
      const rows: StudentImportRow[] = rawRows.map((raw, i) => {
        const rowNum = i + 1;
        const nis = (raw["nis"] ?? "").trim();
        const nama = (raw["nama"] ?? "").trim();
        const grupCode = (raw["grup"] ?? "").trim().toUpperCase();

        // Batch is optional: empty/omitted → default 1. Otherwise must be 1–10.
        const batchRaw = (raw["batch"] ?? "").trim();
        const batch = batchRaw === "" ? 1 : parseInt(batchRaw, 10);

        if (!nis) {
          return { row: rowNum, nis, nama, grup: grupCode, batch, status: "error", error: "Kolom 'nis' wajib diisi." };
        }
        if (nis.length < 5 || nis.length > 20) {
          return { row: rowNum, nis, nama, grup: grupCode, batch, status: "error", error: "NIS harus 5–20 karakter." };
        }
        const dupRow = seenNis.get(nis);
        if (dupRow !== undefined) {
          return { row: rowNum, nis, nama, grup: grupCode, batch, status: "error", error: `NIS '${nis}' duplikat dengan baris ${dupRow}.` };
        }
        seenNis.set(nis, rowNum);
        if (!nama) {
          return { row: rowNum, nis, nama, grup: grupCode, batch, status: "error", error: "Kolom 'nama' wajib diisi." };
        }
        if (nama.length > 100) {
          return { row: rowNum, nis, nama, grup: grupCode, batch, status: "error", error: "Nama melebihi 100 karakter." };
        }
        if (!grupCode) {
          return { row: rowNum, nis, nama, grup: grupCode, batch, status: "error", error: "Kolom 'grup' wajib diisi." };
        }
        const groupId = groupByCode.get(grupCode);
        if (!groupId) {
          return { row: rowNum, nis, nama, grup: grupCode, batch, status: "error", error: `Grup '${grupCode}' tidak ditemukan.` };
        }
        if (batchRaw !== "" && (isNaN(batch) || batch < 1 || batch > 10)) {
          return { row: rowNum, nis, nama, grup: grupCode, batch, status: "error", error: "Batch harus angka 1–10." };
        }
        return { row: rowNum, nis, nama, grup: grupCode, batch, groupId, status: "valid" } as StudentImportRow;
      });

      const validRows = rows.filter((r) => r.status === "valid");

      // Determine which valid NIS already exist in the DB (insert vs update).
      const validNis = validRows.map((r) => r.nis);
      const existingUsers =
        validNis.length > 0
          ? await db
              .select({ id: users.id, nis: users.nis })
              .from(users)
              .where(and(inArray(users.nis, validNis), eq(users.role, STUDENT_ROLE)))
          : [];
      const existingByNis = new Map(existingUsers.map((u) => [u.nis, u.id]));

      // Pre-hash passwords for new students (avoid doing this in the confirm step).
      for (const row of validRows) {
        row.isUpdate = existingByNis.has(row.nis);
        if (!row.isUpdate) {
          row.newId = randomUUID();
          row.plainPassword = generatePassword();
          row.hashedPassword = await bcrypt.hash(row.plainPassword, IMPORT_BCRYPT_ROUNDS);
        }
      }

      // Mode Sync: find students in DB that are absent from the file.
      let toDeleteIds: string[] = [];
      let skippedDeleteCount = 0;
      if (mode === "sync") {
        const fileNisSet = new Set(
          rows.filter((r) => r.nis).map((r) => r.nis)
        );

        const absentStudents =
          fileNisSet.size > 0
            ? await db
                .select({ id: users.id, nis: users.nis })
                .from(users)
                .where(
                  and(
                    eq(users.role, STUDENT_ROLE),
                    notInArray(users.nis, [...fileNisSet])
                  )
                )
            : await db
                .select({ id: users.id, nis: users.nis })
                .from(users)
                .where(eq(users.role, STUDENT_ROLE));

        if (absentStudents.length > 0) {
          const absentIds = absentStudents.map((s) => s.id);
          // Check which absent students have exam history (cannot delete).
          const withSessions = await db
            .select({ userId: examSessions.userId })
            .from(examSessions)
            .where(inArray(examSessions.userId, absentIds));
          const withSessionIds = new Set(withSessions.map((s) => s.userId));

          toDeleteIds = absentIds.filter((id) => !withSessionIds.has(id));
          skippedDeleteCount = absentIds.filter((id) => withSessionIds.has(id)).length;
        }
      }

      const insertCount = validRows.filter((r) => !r.isUpdate).length;
      const updateCount = validRows.filter((r) => r.isUpdate).length;

      const sessionId = studentImportSessions.create({
        mode,
        rows,
        toDeleteIds,
        skippedDeleteCount,
      });

      log.info("Student import dry-run", {
        total: rows.length,
        valid: validRows.length,
        inserts: insertCount,
        updates: updateCount,
        toDelete: toDeleteIds.length,
        skipped: skippedDeleteCount,
        mode,
      });

      return {
        sessionId,
        mode,
        total: rows.length,
        validCount: validRows.length,
        insertCount,
        updateCount,
        ...(mode === "sync"
          ? { toDelete: toDeleteIds.length, skippedDelete: skippedDeleteCount }
          : {}),
        rows: rows.map(({ hashedPassword: _, newId: __, groupId: ___, ...rest }) => rest),
      };
    },
    {
      body: t.Object({
        file: t.File(),
        mode: t.Optional(t.Union([t.Literal("import"), t.Literal("sync")])),
      }),
    }
  )

  /**
   * POST /api/admin/students/import/confirm
   * Executes the upsert (and optional sync deletes) from a dry-run session.
   * @throws {BadRequestError} when the session is missing or expired.
   */
  .post(
    "/students/import/confirm",
    async ({ body }) => {
      const session = studentImportSessions.get(body.sessionId);
      if (!session) {
        throw new BadRequestError(
          "Sesi import tidak ditemukan atau sudah kedaluwarsa. Ulangi upload file."
        );
      }
      studentImportSessions.delete(body.sessionId);

      const validRows = session.rows.filter((r) => r.status === "valid");
      const toInsert = validRows.filter((r) => !r.isUpdate);
      const toUpdate = validRows.filter((r) => r.isUpdate);

      let inserted = 0;
      let updated = 0;
      let deleted = 0;

      await db.transaction(async (tx) => {
        if (toInsert.length > 0) {
          await tx.insert(users).values(
            toInsert.map((r) => ({
              id: r.newId!,
              nis: r.nis,
              name: r.nama,
              password: r.hashedPassword!,
              initialPassword: r.plainPassword ?? null,
              role: STUDENT_ROLE,
              groupId: r.groupId ?? null,
              batch: r.batch,
              isActive: 1,
            }))
          );
          inserted = toInsert.length;
        }

        for (const r of toUpdate) {
          await tx
            .update(users)
            .set({ name: r.nama, groupId: r.groupId ?? null, batch: r.batch })
            .where(and(eq(users.nis, r.nis), eq(users.role, STUDENT_ROLE)));
        }
        updated = toUpdate.length;

        if (session.mode === "sync" && session.toDeleteIds.length > 0) {
          // Re-verify no exam sessions before deleting (guard against race condition).
          const withSessions = await tx
            .select({ userId: examSessions.userId })
            .from(examSessions)
            .where(inArray(examSessions.userId, session.toDeleteIds));
          const withSessionIds = new Set(withSessions.map((s) => s.userId));
          const safeToDelete = session.toDeleteIds.filter((id) => !withSessionIds.has(id));

          if (safeToDelete.length > 0) {
            await tx.delete(users).where(inArray(users.id, safeToDelete));
            deleted = safeToDelete.length;
          }
        }
      });

      log.info("Student import confirmed", { inserted, updated, deleted, mode: session.mode });
      void notifyDashboardStats().catch(() => {});
      return { inserted, updated, deleted, skipped: session.skippedDeleteCount };
    },
    { body: t.Object({ sessionId: t.String() }) }
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
      const plainPassword = body.password;
      const password = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

      await db.insert(users).values({
        id,
        nis,
        name: body.name.trim(),
        password,
        initialPassword: plainPassword,
        role: STUDENT_ROLE,
        groupId,
        batch: body.batch ?? 1,
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
        batch: t.Optional(t.Integer({ minimum: 1, maximum: 10 })),
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
      if (body.batch !== undefined) patch.batch = body.batch;
      if (body.isActive !== undefined) patch.isActive = boolToTiny(body.isActive);
      if (body.password !== undefined) {
        patch.password = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
        patch.initialPassword = body.password;
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
        batch: t.Optional(t.Integer({ minimum: 1, maximum: 10 })),
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
