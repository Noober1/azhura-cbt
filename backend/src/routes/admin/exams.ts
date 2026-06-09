/**
 * Azhura CBT Backend - Admin Exam Routes (Drizzle)
 *
 * Admin-only CRUD for exams/packages and their group assignments. Gated to the
 * `admin` role via {@link requireAdmin}. Question/option CRUD lives in
 * `./questions`. Endpoints (all under `/api/admin`):
 * - `GET    /admin/exams`        — paginated, searchable listing.
 * - `GET    /admin/exams/:id`    — full detail incl. groups + questions (with key).
 * - `POST   /admin/exams`        — create exam + group assignments (transactional).
 * - `PATCH  /admin/exams/:id`    — update exam fields and/or allowed groups.
 * - `DELETE /admin/exams/:id`    — delete (cascades questions/options/groups).
 *
 * Unlike the student-facing routes, admin responses DO include `token` and each
 * question's `correctOptionId` — these are management views.
 */

import { Elysia, t } from "elysia";
import { randomUUID } from "crypto";
import { and, asc, eq, gt, inArray, like, ne, sql } from "drizzle-orm";
import { db, schema } from "../../db";
import { authPlugin } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors";
import { notifyExamListChanged } from "../../lib/exam-events";
import { deriveSessionStatus } from "../../lib/exam-scoring";
import { supervisorActions } from "../../socket";
import { notifyDashboardStats } from "./dashboard";
import { createLogger } from "../../lib/logger";
import {
  parseSpreadsheet,
  generateTemplateXlsx,
  generateTemplateCsv,
  XLSX_CONTENT_TYPE,
  CSV_CONTENT_TYPE,
} from "../../lib/spreadsheet";
import { examImportSessions } from "../../lib/import-session";
import type { ExamImportRow } from "../../lib/import-session";

const { exams, examGroups, examBatches, groups, questions, options, examSessions, users } =
  schema;

const log = createLogger("AdminExam");

/** Exam access token: case-insensitive, alphanumeric, 1–5 chars (see #1, #47). */
const TOKEN_REGEX = /^[A-Za-z0-9]{1,5}$/;

const tinyToBool = (v: number): boolean => v === 1;
const boolToTiny = (v: boolean): number => (v ? 1 : 0);

/**
 * Validates an exam token and normalizes it to upper case (#47) so the stored
 * value is canonical and case-insensitive matching is trivial at session time.
 * Returns the normalized value (string or null for "no token").
 * @throws {BadRequestError} when a non-empty token violates the format.
 */
function normalizeToken(token: string | null | undefined): string | null {
  if (token === undefined || token === null || token === "") return null;
  if (!TOKEN_REGEX.test(token)) {
    throw new BadRequestError(
      "Token harus 1–5 karakter alfanumerik (huruf/angka)."
    );
  }
  return token.toUpperCase();
}

/**
 * Ensures every id in `groupIds` exists in `groups`.
 * @throws {BadRequestError} listing any unknown group ids.
 */
async function assertGroupsExist(groupIds: string[]): Promise<void> {
  if (groupIds.length === 0) return;
  const found = await db
    .select({ id: groups.id })
    .from(groups)
    .where(inArray(groups.id, groupIds));
  const foundIds = new Set(found.map((g) => g.id));
  const missing = groupIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new BadRequestError(`Group tidak ditemukan: ${missing.join(", ")}`);
  }
}

/** Group ids currently assigned to an exam (used to scope realtime notifies). */
async function getExamGroupIds(examId: string): Promise<string[]> {
  const rows = await db
    .select({ groupId: examGroups.groupId })
    .from(examGroups)
    .where(eq(examGroups.examId, examId));
  return rows.map((r) => r.groupId);
}

/** Number of questions in an exam — used to gate activation. */
async function getQuestionCount(examId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(questions)
    .where(eq(questions.examId, examId));
  return Number(count);
}

/**
 * Per-group count of students *currently working* on an exam — i.e. a session
 * that is unsubmitted (`submitted = 0`) and not yet expired (`end_time > now`).
 * Used to (a) block removing a group while its students are mid-exam and (b) lock
 * that group in the admin UI (#29). A session past its `end_time` is treated as
 * over (the timer ran out), so it does not keep a group locked indefinitely.
 *
 * @returns a map of `groupId -> active participant count` (groups with 0 omitted).
 */
async function getActiveParticipantsByGroup(
  examId: string,
  groupIds: string[]
): Promise<Map<string, number>> {
  if (groupIds.length === 0) return new Map();
  const rows = await db
    .select({ groupId: users.groupId, count: sql<number>`count(*)` })
    .from(examSessions)
    .innerJoin(users, eq(users.id, examSessions.userId))
    .where(
      and(
        eq(examSessions.examId, examId),
        eq(examSessions.submitted, 0),
        gt(examSessions.endTime, Date.now()),
        inArray(users.groupId, groupIds)
      )
    )
    .groupBy(users.groupId);

  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.groupId) map.set(r.groupId, Number(r.count));
  }
  return map;
}

/**
 * Full admin detail for one exam: fields + allowed groups + questions/options
 * (including the answer key). Two flat queries are merged in memory because
 * MariaDB rejects Drizzle's relational LATERAL joins (same as the student route).
 */
async function getExamDetail(examId: string) {
  const exam = await db.query.exams.findFirst({
    where: eq(exams.id, examId),
  });
  if (!exam) throw new NotFoundError("Ujian tidak ditemukan.");

  const groupRows = await db
    .select({ id: groups.id, name: groups.name })
    .from(examGroups)
    .innerJoin(groups, eq(groups.id, examGroups.groupId))
    .where(eq(examGroups.examId, examId))
    .orderBy(asc(groups.name));

  const batchRows = await db
    .select({ batch: examBatches.batch })
    .from(examBatches)
    .where(eq(examBatches.examId, examId))
    .orderBy(asc(examBatches.batch));

  // Active-participant counts let the admin UI lock groups that can't be removed
  // while students are mid-exam (#29).
  const activeByGroup = await getActiveParticipantsByGroup(
    examId,
    groupRows.map((g) => g.id)
  );

  const questionRows = await db
    .select({
      id: questions.id,
      text: questions.text,
      orderIndex: questions.orderIndex,
      correctOptionId: questions.correctOptionId,
    })
    .from(questions)
    .where(eq(questions.examId, examId))
    .orderBy(asc(questions.orderIndex));

  const optionRows = questionRows.length
    ? await db
        .select({
          id: options.id,
          questionId: options.questionId,
          text: options.text,
        })
        .from(options)
        .where(
          inArray(
            options.questionId,
            questionRows.map((q) => q.id)
          )
        )
        .orderBy(asc(options.orderIndex))
    : [];

  const optionsByQuestion = new Map<string, { id: string; text: string }[]>();
  for (const o of optionRows) {
    const bucket = optionsByQuestion.get(o.questionId) ?? [];
    bucket.push({ id: o.id, text: o.text });
    optionsByQuestion.set(o.questionId, bucket);
  }

  return {
    id: exam.id,
    title: exam.title,
    durationMinutes: exam.durationMinutes,
    isActive: tinyToBool(exam.isActive),
    token: exam.token,
    expiredAt: exam.expiredAt.getTime(),
    randomizeQuestion: tinyToBool(exam.randomizeQuestion),
    randomizeAnswer: tinyToBool(exam.randomizeAnswer),
    passingGrade: exam.passingGrade,
    createdAt: exam.createdAt.getTime(),
    /** Batch numbers allowed to access this exam. Empty means open to all batches. */
    batches: batchRows.map((b) => Number(b.batch)),
    allowedGroups: groupRows.map((g) => ({
      id: g.id,
      name: g.name,
      activeParticipants: activeByGroup.get(g.id) ?? 0,
    })),
    questions: questionRows.map((q) => ({
      id: q.id,
      text: q.text,
      orderIndex: q.orderIndex,
      correctOptionId: q.correctOptionId,
      options: optionsByQuestion.get(q.id) ?? [],
    })),
  };
}

export const adminExamRoutes = new Elysia({ prefix: "/admin" })
  .use(authPlugin)
  .onBeforeHandle(requireAdmin)

  /**
   * GET /api/admin/exams?q=&page=&limit=
   * Paginated, title-searchable listing with per-exam question/group counts.
   * @returns `{ data, meta: { total, page, limit } }`
   */
  .get(
    "/exams",
    async ({ query }) => {
      const page = Math.max(1, query.page ?? 1);
      const limit = Math.min(100, Math.max(1, query.limit ?? 20));
      const offset = (page - 1) * limit;
      const search = query.q?.trim();
      const where = search ? like(exams.title, `%${search}%`) : undefined;

      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(exams)
        .where(where);

      const rows = await db
        .select({
          id: exams.id,
          title: exams.title,
          durationMinutes: exams.durationMinutes,
          isActive: exams.isActive,
          token: exams.token,
          expiredAt: exams.expiredAt,
          randomizeQuestion: exams.randomizeQuestion,
          randomizeAnswer: exams.randomizeAnswer,
          passingGrade: exams.passingGrade,
          createdAt: exams.createdAt,
        })
        .from(exams)
        .where(where)
        .orderBy(asc(exams.createdAt))
        .limit(limit)
        .offset(offset);

      const ids = rows.map((r) => r.id);

      // Batch the per-exam aggregates to avoid N+1 queries.
      const questionCounts = ids.length
        ? await db
            .select({
              examId: questions.examId,
              count: sql<number>`count(*)`,
            })
            .from(questions)
            .where(inArray(questions.examId, ids))
            .groupBy(questions.examId)
        : [];
      const groupCounts = ids.length
        ? await db
            .select({
              examId: examGroups.examId,
              count: sql<number>`count(*)`,
            })
            .from(examGroups)
            .where(inArray(examGroups.examId, ids))
            .groupBy(examGroups.examId)
        : [];
      const batchListRows = ids.length
        ? await db
            .select({ examId: examBatches.examId, batch: examBatches.batch })
            .from(examBatches)
            .where(inArray(examBatches.examId, ids))
            .orderBy(asc(examBatches.batch))
        : [];

      const qById = new Map(questionCounts.map((r) => [r.examId, Number(r.count)]));
      const gById = new Map(groupCounts.map((r) => [r.examId, Number(r.count)]));
      const batchesById = new Map<string, number[]>();
      for (const r of batchListRows) {
        if (!batchesById.has(r.examId)) batchesById.set(r.examId, []);
        batchesById.get(r.examId)!.push(Number(r.batch));
      }

      return {
        data: rows.map((r) => ({
          id: r.id,
          title: r.title,
          durationMinutes: r.durationMinutes,
          isActive: tinyToBool(r.isActive),
          token: r.token,
          expiredAt: r.expiredAt.getTime(),
          randomizeQuestion: tinyToBool(r.randomizeQuestion),
          randomizeAnswer: tinyToBool(r.randomizeAnswer),
          passingGrade: r.passingGrade,
          createdAt: r.createdAt.getTime(),
          totalQuestions: qById.get(r.id) ?? 0,
          totalGroups: gById.get(r.id) ?? 0,
          batches: batchesById.get(r.id) ?? [],
        })),
        meta: { total: Number(total), page, limit },
      };
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        page: t.Optional(t.Number({ minimum: 1 })),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
    }
  )

  /**
   * GET /api/admin/exams/template?format=xlsx|csv
   * Downloads an empty import template with example data.
   */
  .get(
    "/exams/template",
    async ({ query }) => {
      const format = query.format === "csv" ? "csv" : "xlsx";
      const headers = ["judul", "durasi_menit", "passing_grade", "token", "expired_at"];
      const example = {
        judul: "Ujian Matematika Semester 1",
        durasi_menit: "60",
        passing_grade: "70",
        token: "MTK01",
        expired_at: "2025-12-31 08:00",
      };

      if (format === "csv") {
        const csv = generateTemplateCsv(headers, example);
        return new Response(csv, {
          headers: {
            "Content-Type": CSV_CONTENT_TYPE,
            "Content-Disposition": 'attachment; filename="template-ujian.csv"',
          },
        });
      }

      const buf = await generateTemplateXlsx(headers, example);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": XLSX_CONTENT_TYPE,
          "Content-Disposition": 'attachment; filename="template-ujian.xlsx"',
        },
      });
    },
    { query: t.Object({ format: t.Optional(t.String()) }) }
  )

  /**
   * POST /api/admin/exams/import
   * Accepts a multipart upload (.xlsx or .csv), parses and validates all rows,
   * performs a dry-run (no DB writes), and returns a preview with a session token.
   *
   * Mode: Add-only — existing exam titles are skipped (not an error). Duplicate
   * titles within the file → first occurrence processed, rest skipped.
   * Batch cap: 500 rows.
   *
   * @throws {BadRequestError} when the file format is wrong or too many rows.
   */
  .post(
    "/exams/import",
    async ({ body }) => {
      const MAX_ROWS = 500;
      const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

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

      // Resolve which titles already exist in the DB (skip, not error).
      const rawTitles = rawRows
        .map((r) => (r["judul"] ?? "").trim())
        .filter((t) => t.length > 0);
      const existingTitles: Set<string> =
        rawTitles.length > 0
          ? new Set(
              (
                await db
                  .select({ title: exams.title })
                  .from(exams)
                  .where(inArray(exams.title, rawTitles))
              ).map((e) => e.title)
            )
          : new Set();

      const seenTitles = new Map<string, number>(); // title → first row number
      const now = new Date();

      const rows: ExamImportRow[] = rawRows.map((raw, i) => {
        const rowNum = i + 1;

        const judul = (raw["judul"] ?? "").trim();
        const durasiRaw = (raw["durasi_menit"] ?? "").trim();
        const pgRaw = (raw["passing_grade"] ?? "").trim();
        const tokenRaw = (raw["token"] ?? "").trim();
        const expiredAtRaw = (raw["expired_at"] ?? "").trim();

        // Validate judul
        if (!judul) {
          return { row: rowNum, judul, status: "error" as const, reason: "Kolom 'judul' wajib diisi." };
        }
        if (judul.length > 200) {
          return { row: rowNum, judul, status: "error" as const, reason: "Judul melebihi 200 karakter." };
        }

        // Duplicate title within file → skip (first occurrence is processed)
        const prevRow = seenTitles.get(judul);
        if (prevRow !== undefined) {
          return { row: rowNum, judul, status: "skip" as const, reason: `Judul duplikat dengan baris ${prevRow} dalam file ini.` };
        }
        seenTitles.set(judul, rowNum);

        // Title already in DB → skip
        if (existingTitles.has(judul)) {
          return { row: rowNum, judul, status: "skip" as const, reason: "Judul sudah ada di database (dilewati)." };
        }

        // Validate durasi_menit
        const durasi = parseInt(durasiRaw, 10);
        if (!durasiRaw || isNaN(durasi) || durasi < 1 || durasi > 480) {
          return { row: rowNum, judul, status: "error" as const, reason: "Kolom 'durasi_menit' wajib diisi dan harus integer 1–480." };
        }

        // Validate passing_grade
        const pg = parseInt(pgRaw, 10);
        if (!pgRaw || isNaN(pg) || pg < 0 || pg > 100) {
          return { row: rowNum, judul, durasi_menit: durasi, status: "error" as const, reason: "Kolom 'passing_grade' wajib diisi dan harus integer 0–100." };
        }

        // Validate token (optional, max 5 chars alphanumeric)
        const tokenVal = tokenRaw || undefined;
        if (tokenVal !== undefined && !/^[A-Za-z0-9]{1,5}$/.test(tokenVal)) {
          return { row: rowNum, judul, durasi_menit: durasi, passing_grade: pg, status: "error" as const, reason: "Token harus 1–5 karakter alfanumerik (jika diisi)." };
        }

        // Validate expired_at (format YYYY-MM-DD HH:mm, must be in future)
        if (!expiredAtRaw) {
          return { row: rowNum, judul, durasi_menit: durasi, passing_grade: pg, token: tokenVal, status: "error" as const, reason: "Kolom 'expired_at' wajib diisi." };
        }
        // Accept both "YYYY-MM-DD HH:mm" and "YYYY-MM-DD HH:mm:ss" (Excel may append seconds)
        const parsedDate = new Date(expiredAtRaw.replace(" ", "T"));
        if (isNaN(parsedDate.getTime())) {
          return { row: rowNum, judul, durasi_menit: durasi, passing_grade: pg, token: tokenVal, expired_at: expiredAtRaw, status: "error" as const, reason: "Format 'expired_at' tidak valid. Gunakan format YYYY-MM-DD HH:mm." };
        }
        if (parsedDate <= now) {
          return { row: rowNum, judul, durasi_menit: durasi, passing_grade: pg, token: tokenVal, expired_at: expiredAtRaw, status: "error" as const, reason: "Tanggal 'expired_at' harus di masa depan." };
        }

        return {
          row: rowNum,
          judul,
          durasi_menit: durasi,
          passing_grade: pg,
          token: tokenVal,
          expired_at: expiredAtRaw,
          status: "ready" as const,
          newId: randomUUID(),
        };
      });

      const readyCount = rows.filter((r) => r.status === "ready").length;
      const skipCount = rows.filter((r) => r.status === "skip").length;
      const errorCount = rows.filter((r) => r.status === "error").length;

      const sessionToken = examImportSessions.create({ rows });

      log.info("Exam import dry-run", {
        total: rows.length,
        ready: readyCount,
        skip: skipCount,
        error: errorCount,
      });

      return {
        sessionToken,
        summary: { ready: readyCount, skip: skipCount, error: errorCount },
        rows: rows.map(({ newId: _, ...rest }) => rest),
      };
    },
    {
      body: t.Object({ file: t.File() }),
    }
  )

  /**
   * POST /api/admin/exams/import/confirm
   * Executes the bulk insert from a dry-run session.
   * @throws {BadRequestError} when the session is missing or expired.
   */
  .post(
    "/exams/import/confirm",
    async ({ body }) => {
      const session = examImportSessions.get(body.sessionToken);
      if (!session) {
        throw new BadRequestError(
          "Sesi import tidak ditemukan atau sudah kedaluwarsa. Ulangi upload file."
        );
      }
      examImportSessions.delete(body.sessionToken);

      const readyRows = session.rows.filter((r) => r.status === "ready");

      let inserted = 0;
      let skipped = 0;

      if (readyRows.length > 0) {
        // Re-check for titles that may have been inserted since the dry-run.
        const titles = readyRows.map((r) => r.judul);
        const existing = await db
          .select({ title: exams.title })
          .from(exams)
          .where(inArray(exams.title, titles));
        const existingSet = new Set(existing.map((e) => e.title));

        const toInsert = readyRows.filter((r) => !existingSet.has(r.judul));
        skipped = readyRows.length - toInsert.length;

        if (toInsert.length > 0) {
          await db.insert(exams).values(
            toInsert.map((r) => ({
              id: r.newId!,
              title: r.judul,
              durationMinutes: r.durasi_menit!,
              passingGrade: r.passing_grade!,
              token: r.token ? r.token.toUpperCase() : null,
              expiredAt: new Date(r.expired_at!.replace(" ", "T")),
              isActive: 0 as const,
              randomizeQuestion: 1 as const,
              randomizeAnswer: 1 as const,
            }))
          );
          inserted = toInsert.length;
        }
      }

      log.info("Exam import confirmed", { inserted, skipped });
      void notifyDashboardStats().catch(() => {});
      return { inserted, skipped };
    },
    { body: t.Object({ sessionToken: t.String() }) }
  )

  /**
   * GET /api/admin/exams/:id
   * Full management detail incl. allowed groups and questions (with answer key).
   * @throws {NotFoundError} when the exam does not exist.
   */
  .get("/exams/:examId", ({ params }) => getExamDetail(params.examId))

  /**
   * POST /api/admin/exams
   * Creates an exam plus its group assignments in one transaction.
   */
  .post(
    "/exams",
    async ({ body, set }) => {
      const token = normalizeToken(body.token);
      const allowedGroups = body.allowedGroups ?? [];
      const batches = body.batches ?? [];
      await assertGroupsExist(allowedGroups);

      // A brand-new exam has no questions yet, so it cannot be created active.
      if (body.isActive === true) {
        throw new BadRequestError(
          "Ujian tanpa soal tidak dapat diaktifkan. Simpan sebagai nonaktif, tambahkan soal, lalu aktifkan."
        );
      }

      const id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(exams).values({
          id,
          title: body.title,
          durationMinutes: body.durationMinutes,
          isActive: boolToTiny(body.isActive ?? false),
          token,
          expiredAt: new Date(body.expiredAt),
          randomizeQuestion: boolToTiny(body.randomizeQuestion ?? true),
          randomizeAnswer: boolToTiny(body.randomizeAnswer ?? true),
          passingGrade: body.passingGrade ?? 0,
        });
        if (allowedGroups.length > 0) {
          await tx
            .insert(examGroups)
            .values(allowedGroups.map((groupId) => ({ examId: id, groupId })));
        }
        if (batches.length > 0) {
          await tx
            .insert(examBatches)
            .values(batches.map((batch) => ({ examId: id, batch })));
        }
      });

      notifyExamListChanged(allowedGroups);
      log.info("Exam created", { id, title: body.title });
      void notifyDashboardStats().catch(() => {});
      set.status = 201;
      return getExamDetail(id);
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 200 }),
        durationMinutes: t.Integer({ minimum: 1 }),
        expiredAt: t.Number(),
        isActive: t.Optional(t.Boolean()),
        token: t.Optional(t.Nullable(t.String())),
        randomizeQuestion: t.Optional(t.Boolean()),
        randomizeAnswer: t.Optional(t.Boolean()),
        passingGrade: t.Optional(t.Integer({ minimum: 0, maximum: 100 })),
        allowedGroups: t.Optional(t.Array(t.String())),
        batches: t.Optional(t.Array(t.Integer({ minimum: 1, maximum: 10 }), { maxItems: 10 })),
      }),
    }
  )

  /**
   * PATCH /api/admin/exams/:id
   * Partially updates exam fields; when `allowedGroups` is provided it fully
   * replaces the exam's group set. Transactional.
   * @throws {NotFoundError} when the exam does not exist.
   */
  .patch(
    "/exams/:examId",
    async ({ params, body }) => {
      const id = params.examId;
      const existing = await db.query.exams.findFirst({
        columns: { id: true },
        where: eq(exams.id, id),
      });
      if (!existing) throw new NotFoundError("Ujian tidak ditemukan.");

      if (body.allowedGroups) await assertGroupsExist(body.allowedGroups);

      // Cannot activate an exam that has no questions.
      if (body.isActive === true && (await getQuestionCount(id)) === 0) {
        throw new BadRequestError(
          "Ujian tanpa soal tidak dapat diaktifkan. Tambahkan minimal 1 soal terlebih dahulu."
        );
      }

      // Build a partial update only from the fields actually supplied.
      const patch: Partial<typeof exams.$inferInsert> = {};
      if (body.title !== undefined) patch.title = body.title;
      if (body.durationMinutes !== undefined)
        patch.durationMinutes = body.durationMinutes;
      if (body.isActive !== undefined) patch.isActive = boolToTiny(body.isActive);
      if (body.token !== undefined) patch.token = normalizeToken(body.token);
      if (body.expiredAt !== undefined) patch.expiredAt = new Date(body.expiredAt);
      if (body.randomizeQuestion !== undefined)
        patch.randomizeQuestion = boolToTiny(body.randomizeQuestion);
      if (body.randomizeAnswer !== undefined)
        patch.randomizeAnswer = boolToTiny(body.randomizeAnswer);
      if (body.passingGrade !== undefined) patch.passingGrade = body.passingGrade;

      const groupsBefore = await getExamGroupIds(id);

      // Integrity guard (#29): refuse to remove a group from allowedGroups while
      // any of its students are mid-exam (active, unsubmitted, unexpired session).
      // Doing so would orphan a running attempt. Wait for them to finish, or keep
      // the group allowed.
      if (body.allowedGroups) {
        const removed = groupsBefore.filter(
          (g) => !body.allowedGroups!.includes(g)
        );
        if (removed.length > 0) {
          const active = await getActiveParticipantsByGroup(id, removed);
          const blocked = removed.filter((g) => (active.get(g) ?? 0) > 0);
          if (blocked.length > 0) {
            const named = await db
              .select({ id: groups.id, name: groups.name })
              .from(groups)
              .where(inArray(groups.id, blocked));
            const nameById = new Map(named.map((n) => [n.id, n.name]));
            const detail = blocked
              .map((g) => `${nameById.get(g) ?? g} (${active.get(g)} peserta aktif)`)
              .join(", ");
            throw new ConflictError(
              `Tidak dapat mengeluarkan group yang masih memiliki peserta sedang mengerjakan: ${detail}. ` +
                "Tunggu hingga mereka selesai, atau biarkan group tetap diizinkan."
            );
          }
        }
      }

      await db.transaction(async (tx) => {
        if (Object.keys(patch).length > 0) {
          await tx.update(exams).set(patch).where(eq(exams.id, id));
        }
        if (body.allowedGroups) {
          await tx.delete(examGroups).where(eq(examGroups.examId, id));
          if (body.allowedGroups.length > 0) {
            await tx
              .insert(examGroups)
              .values(body.allowedGroups.map((groupId) => ({ examId: id, groupId })));
          }
        }
        if (body.batches !== undefined) {
          // Replace strategy: delete all existing batch restrictions and re-insert.
          await tx.delete(examBatches).where(eq(examBatches.examId, id));
          if (body.batches.length > 0) {
            await tx
              .insert(examBatches)
              .values(body.batches.map((batch) => ({ examId: id, batch })));
          }
        }
      });

      // Notify the union of groups touched (old ∪ new) so both gainers and
      // losers refresh their listing.
      const affected = new Set([...groupsBefore, ...(body.allowedGroups ?? [])]);
      notifyExamListChanged([...affected]);
      log.info("Exam updated", { id });
      void notifyDashboardStats().catch(() => {});
      return getExamDetail(id);
    },
    {
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        durationMinutes: t.Optional(t.Integer({ minimum: 1 })),
        expiredAt: t.Optional(t.Number()),
        isActive: t.Optional(t.Boolean()),
        token: t.Optional(t.Nullable(t.String())),
        randomizeQuestion: t.Optional(t.Boolean()),
        randomizeAnswer: t.Optional(t.Boolean()),
        passingGrade: t.Optional(t.Integer({ minimum: 0, maximum: 100 })),
        allowedGroups: t.Optional(t.Array(t.String())),
        batches: t.Optional(t.Array(t.Integer({ minimum: 1, maximum: 10 }), { maxItems: 10 })),
      }),
    }
  )

  /**
   * DELETE /api/admin/exams/:id
   * Deletes the exam; questions, options and group links cascade via FK.
   * @throws {NotFoundError} when the exam does not exist.
   * @throws {ConflictError} when the exam already has participant sessions.
   */
  .delete("/exams/:examId", async ({ params }) => {
    const id = params.examId;
    const existing = await db.query.exams.findFirst({
      columns: { id: true },
      where: eq(exams.id, id),
    });
    if (!existing) throw new NotFoundError("Ujian tidak ditemukan.");

    // Guard: an exam with recorded participant sessions can't be deleted — that
    // would destroy results, answers, and anti-cheat logs (the underlying FKs on
    // exam_sessions/answers/cheat_logs RESTRICT it at the DB level anyway, which
    // would otherwise surface as an opaque 500). Surface a clear 409 instead and
    // tell the admin to deactivate the exam if they no longer want it used.
    const session = await db.query.examSessions.findFirst({
      columns: { id: true },
      where: eq(examSessions.examId, id),
    });
    if (session) {
      throw new ConflictError(
        "Ujian sudah memiliki sesi peserta dan tidak dapat dihapus. " +
          "Nonaktifkan ujian jika tidak ingin digunakan lagi."
      );
    }

    const groupsBefore = await getExamGroupIds(id);
    await db.delete(exams).where(eq(exams.id, id));

    notifyExamListChanged(groupsBefore);
    log.info("Exam deleted", { id });
    void notifyDashboardStats().catch(() => {});
    return { success: true };
  })

  /**
   * GET /api/admin/exams/:examId/sessions
   * Lists all exam sessions (participants) for one exam, with derived status.
   * @throws {NotFoundError} when the exam does not exist.
   */
  .get("/exams/:examId/sessions", async ({ params }) => {
    const { examId } = params;
    const exam = await db.query.exams.findFirst({
      columns: { id: true },
      where: eq(exams.id, examId),
    });
    if (!exam) throw new NotFoundError("Ujian tidak ditemukan.");

    const rows = await db
      .select({
        id: examSessions.id,
        userId: examSessions.userId,
        name: users.name,
        nis: users.nis,
        groupName: groups.name,
        startTime: examSessions.startTime,
        endTime: examSessions.endTime,
        submitted: examSessions.submitted,
      })
      .from(examSessions)
      .innerJoin(users, eq(users.id, examSessions.userId))
      .leftJoin(groups, eq(groups.id, users.groupId))
      .where(eq(examSessions.examId, examId))
      .orderBy(asc(examSessions.startTime));

    const now = Date.now();
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      nis: r.nis,
      groupName: r.groupName ?? null,
      startTime: r.startTime,
      endTime: r.endTime,
      status: deriveSessionStatus(r.submitted, r.endTime, now),
    }));
  })

  /**
   * PATCH /api/admin/sessions/:sessionId/reset
   * Resets a submitted session back to in_progress, extending end_time by the
   * exam's full duration from now. Answers are preserved.
   *
   * Authorization note: this system uses a flat global-admin model — all admins
   * have access to all sessions across all exams. The `requireAdmin` guard above
   * enforces this. If a per-exam or multi-tenant admin model is introduced later,
   * add a check that `session.examId` belongs to the caller's allowed scope.
   *
   * @throws {NotFoundError}  when the session does not exist.
   * @throws {ConflictError}  when the session is not in the submitted state, or
   *   when the participant already has another active (in-progress) session —
   *   resetting then would leave them with two live sessions at once.
   */
  .patch("/sessions/:sessionId/reset", async ({ params }) => {
    const { sessionId } = params;
    const session = await db.query.examSessions.findFirst({
      where: eq(examSessions.id, sessionId),
    });
    if (!session) throw new NotFoundError("Sesi tidak ditemukan.");
    if (session.submitted !== 1) {
      throw new ConflictError(
        "Hanya sesi dengan status selesai yang dapat direset."
      );
    }

    // Guard against multi-session: if this participant is already mid-exam in
    // another session (unsubmitted and not yet expired), reset would create a
    // second concurrent live session. Reject so a student can never end up with
    // the current session *and* the reset one active at the same time.
    const now = Date.now();
    const activeElsewhere = await db.query.examSessions.findFirst({
      columns: { id: true },
      where: and(
        eq(examSessions.userId, session.userId),
        eq(examSessions.submitted, 0),
        gt(examSessions.endTime, now),
        ne(examSessions.id, sessionId)
      ),
    });
    if (activeElsewhere) {
      throw new ConflictError(
        "Peserta sedang mengerjakan sesi ujian lain. Reset ditolak untuk mencegah sesi ganda."
      );
    }

    const exam = await db.query.exams.findFirst({
      columns: { durationMinutes: true },
      where: eq(exams.id, session.examId),
    });
    if (!exam) throw new NotFoundError("Ujian tidak ditemukan.");

    const newEndTime = Date.now() + exam.durationMinutes * 60 * 1000;
    await db
      .update(examSessions)
      .set({ submitted: 0, endTime: newEndTime })
      .where(eq(examSessions.id, sessionId));

    // Realtime nudge (#58): tell the student's client to re-check its active
    // session and resume into the exam immediately, instead of only noticing the
    // reset on the next manual refresh. A disconnected student falls back to the
    // dashboard resume-check on reconnect/refresh.
    supervisorActions.resumeSessionUser(session.userId);

    log.info("Session reset", { sessionId, examId: session.examId });
    return { success: true };
  });
