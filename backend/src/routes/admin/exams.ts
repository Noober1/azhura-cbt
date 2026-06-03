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
import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import { db, schema } from "../../db";
import { authPlugin } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { BadRequestError, NotFoundError } from "../../lib/errors";
import { notifyExamListChanged } from "../../lib/exam-events";
import { createLogger } from "../../lib/logger";

const { exams, examGroups, groups, questions, options } = schema;

const log = createLogger("AdminExam");

/** Exam access token: case-sensitive, alphanumeric, 1–5 chars (see #1). */
const TOKEN_REGEX = /^[A-Za-z0-9]{1,5}$/;

const tinyToBool = (v: number): boolean => v === 1;
const boolToTiny = (v: boolean): number => (v ? 1 : 0);

/**
 * Validates an exam token. Returns the normalized value (string or null).
 * @throws {BadRequestError} when a non-empty token violates the format.
 */
function normalizeToken(token: string | null | undefined): string | null {
  if (token === undefined || token === null || token === "") return null;
  if (!TOKEN_REGEX.test(token)) {
    throw new BadRequestError(
      "Token harus 1–5 karakter alfanumerik (huruf/angka, case-sensitive)."
    );
  }
  return token;
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
        .orderBy(asc(options.id))
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
    createdAt: exam.createdAt.getTime(),
    allowedGroups: groupRows,
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

      const qById = new Map(questionCounts.map((r) => [r.examId, Number(r.count)]));
      const gById = new Map(groupCounts.map((r) => [r.examId, Number(r.count)]));

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
          createdAt: r.createdAt.getTime(),
          totalQuestions: qById.get(r.id) ?? 0,
          totalGroups: gById.get(r.id) ?? 0,
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
        });
        if (allowedGroups.length > 0) {
          await tx
            .insert(examGroups)
            .values(allowedGroups.map((groupId) => ({ examId: id, groupId })));
        }
      });

      notifyExamListChanged(allowedGroups);
      log.info("Exam created", { id, title: body.title });
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
        allowedGroups: t.Optional(t.Array(t.String())),
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

      const groupsBefore = await getExamGroupIds(id);

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
      });

      // Notify the union of groups touched (old ∪ new) so both gainers and
      // losers refresh their listing.
      const affected = new Set([...groupsBefore, ...(body.allowedGroups ?? [])]);
      notifyExamListChanged([...affected]);
      log.info("Exam updated", { id });
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
        allowedGroups: t.Optional(t.Array(t.String())),
      }),
    }
  )

  /**
   * DELETE /api/admin/exams/:id
   * Deletes the exam; questions, options and group links cascade via FK.
   * @throws {NotFoundError} when the exam does not exist.
   */
  .delete("/exams/:examId", async ({ params }) => {
    const id = params.examId;
    const existing = await db.query.exams.findFirst({
      columns: { id: true },
      where: eq(exams.id, id),
    });
    if (!existing) throw new NotFoundError("Ujian tidak ditemukan.");

    const groupsBefore = await getExamGroupIds(id);
    await db.delete(exams).where(eq(exams.id, id));

    notifyExamListChanged(groupsBefore);
    log.info("Exam deleted", { id });
    return { success: true };
  });
