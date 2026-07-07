/**
 * Azhura CBT Backend - Admin Question/Option Routes (Drizzle)
 *
 * Admin-only CRUD for an exam's questions and their options, gated to the
 * `admin` role via {@link requireAdmin}. All endpoints are nested under an exam
 * (`/api/admin/exams/:examId/questions`):
 * - `GET    .../questions`      — list questions with options + answer key.
 * - `POST   .../questions`      — create a question + its options (transactional).
 * - `PATCH  .../questions/:qid` — update text/order and/or replace the options.
 * - `DELETE .../questions/:qid` — delete a question (options cascade).
 *
 * The answer key (`correctOptionId`) is part of these management views — it is
 * never exposed on the student-facing routes.
 *
 * Note on identity: `questions.correct_option_id` has no DB-level FK, so we can
 * insert the question (carrying a pre-generated correct option id) and its
 * options in the same transaction without ordering constraints. Changing the
 * correct answer requires re-sending `options` (a full replace), which keeps
 * the index→id mapping unambiguous.
 */

import { Elysia, t } from "elysia";
import { randomUUID } from "crypto";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { db, schema } from "../../db";
import { findExternalMediaSrc } from "../../lib/question-content";
import { authPlugin } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors";
import { notifyExamListChanged } from "../../lib/exam-events";
import { createLogger } from "../../lib/logger";

const { exams, examGroups, examSessions, questions, options, answers } = schema;

const log = createLogger("AdminQuestion");

/** @throws {NotFoundError} when the exam does not exist. */
async function assertExamExists(examId: string): Promise<void> {
  const exam = await db.query.exams.findFirst({
    columns: { id: true },
    where: eq(exams.id, examId),
  });
  if (!exam) throw new NotFoundError("Ujian tidak ditemukan.");
}

/** Group ids assigned to an exam — scopes the realtime list notify. */
async function getExamGroupIds(examId: string): Promise<string[]> {
  const rows = await db
    .select({ groupId: examGroups.groupId })
    .from(examGroups)
    .where(eq(examGroups.examId, examId));
  return rows.map((r) => r.groupId);
}

const ACTIVE_SESSIONS_ERROR =
  "Tidak dapat mengubah soal saat ada peserta sedang mengerjakan ujian.";

/** Admin detail for one question (fields + options + answer key). */
async function getQuestionDetail(examId: string, questionId: string) {
  const question = await db.query.questions.findFirst({
    where: and(eq(questions.id, questionId), eq(questions.examId, examId)),
  });
  if (!question) throw new NotFoundError("Soal tidak ditemukan.");

  const optionRows = await db
    .select({ id: options.id, text: options.text, imageUrl: options.imageUrl })
    .from(options)
    .where(eq(options.questionId, questionId))
    .orderBy(asc(options.orderIndex));

  return {
    id: question.id,
    examId: question.examId,
    text: question.text,
    type: question.type ?? "multiple_choice",
    config: question.config ?? null,
    orderIndex: question.orderIndex,
    correctOptionId: question.correctOptionId,
    options: optionRows,
  };
}

export const adminQuestionRoutes = new Elysia({ prefix: "/admin" })
  .use(authPlugin)
  .onBeforeHandle(requireAdmin)

  /**
   * GET /api/admin/exams/:examId/questions
   * Lists every question for an exam, each with its options and answer key.
   * @throws {NotFoundError} when the exam does not exist.
   */
  .get("/exams/:examId/questions", async ({ params }) => {
    await assertExamExists(params.examId);

    const questionRows = await db
      .select({
        id: questions.id,
        text: questions.text,
        type: questions.type,
        config: questions.config,
        orderIndex: questions.orderIndex,
        correctOptionId: questions.correctOptionId,
      })
      .from(questions)
      .where(eq(questions.examId, params.examId))
      .orderBy(asc(questions.orderIndex));

    const optionRows = questionRows.length
      ? await db
          .select({
            id: options.id,
            questionId: options.questionId,
            text: options.text,
            imageUrl: options.imageUrl,
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

    const byQuestion = new Map<string, { id: string; text: string; imageUrl: string | null }[]>();
    for (const o of optionRows) {
      const bucket = byQuestion.get(o.questionId) ?? [];
      bucket.push({ id: o.id, text: o.text, imageUrl: o.imageUrl });
      byQuestion.set(o.questionId, bucket);
    }

    return questionRows.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type ?? "multiple_choice",
      config: q.config ?? null,
      orderIndex: q.orderIndex,
      correctOptionId: q.correctOptionId,
      options: byQuestion.get(q.id) ?? [],
    }));
  })

  /**
   * POST /api/admin/exams/:examId/questions
   * Creates a question with its options; `correctOptionIndex` marks which of the
   * supplied options is correct. Transactional.
   * @throws {NotFoundError}   when the exam does not exist.
   * @throws {BadRequestError} when `correctOptionIndex` is out of range.
   */
  .post(
    "/exams/:examId/questions",
    async ({ params, body, set }) => {
      const { examId } = params;
      await assertExamExists(examId);

      const qType = body.type ?? "multiple_choice";
      const questionId = randomUUID();

      const externalSrc = findExternalMediaSrc(body.text);
      // `!== null` (not truthiness): an empty `src=""` is a non-/uploads value
      // that must also be rejected, and the empty string is falsy.
      if (externalSrc !== null) {
        throw new BadRequestError(
          "Media pada soal harus diunggah ke pustaka media; URL eksternal tidak diizinkan."
        );
      }

      await db.transaction(async (tx) => {
        const [active] = await tx
          .select({ id: examSessions.id })
          .from(examSessions)
          .where(and(eq(examSessions.examId, examId), eq(examSessions.submitted, 0), gt(examSessions.endTime, Date.now())))
          .limit(1);
        if (active) throw new ConflictError(ACTIVE_SESSIONS_ERROR);

        if (qType === "multiple_choice") {
          if (body.options === undefined || body.correctOptionIndex === undefined) {
            throw new BadRequestError("options dan correctOptionIndex wajib untuk soal pilihan ganda.");
          }
          if (body.options.length < 2) {
            throw new BadRequestError("Soal pilihan ganda harus memiliki minimal 2 opsi.");
          }
          if (body.correctOptionIndex >= body.options.length) {
            throw new BadRequestError("correctOptionIndex di luar jangkauan daftar opsi.");
          }
          const optionRows = body.options.map((o, index) => ({
            id: randomUUID(),
            questionId,
            text: o.text,
            orderIndex: index,
            imageUrl: o.imageUrl ?? null,
          }));
          const correctOptionId = optionRows[body.correctOptionIndex].id;
          await tx.insert(questions).values({
            id: questionId,
            examId,
            text: body.text,
            type: "multiple_choice",
            correctOptionId,
            orderIndex: body.orderIndex ?? 0,
          });
          await tx.insert(options).values(optionRows);
        } else {
          if (!body.config) throw new BadRequestError("config wajib untuk tipe soal ini.");
          await tx.insert(questions).values({
            id: questionId,
            examId,
            text: body.text,
            type: qType,
            config: body.config,
            orderIndex: body.orderIndex ?? 0,
          });
        }
      });

      notifyExamListChanged(await getExamGroupIds(examId));
      log.info("Question created", { examId, questionId, type: qType });
      set.status = 201;
      return getQuestionDetail(examId, questionId);
    },
    {
      body: t.Object({
        text: t.String({ minLength: 1 }),
        orderIndex: t.Optional(t.Integer({ minimum: 0 })),
        type: t.Optional(t.Union([
          t.Literal("multiple_choice"),
          t.Literal("fill_in_blank"),
          t.Literal("matching"),
          t.Literal("sorting"),
        ])),
        // minItems omitted here; runtime handler validates count per type.
        options: t.Optional(
          t.Array(
            t.Object({
              text: t.String({ minLength: 1 }),
              imageUrl: t.Optional(t.Nullable(t.String({ maxLength: 500, pattern: "^/uploads/" }))),
            })
          )
        ),
        correctOptionIndex: t.Optional(t.Integer({ minimum: 0 })),
        // Use Record to accept any plain object (avoids exact-mirror coercion issues with t.Any).
        config: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
    }
  )

  /**
   * PATCH /api/admin/exams/:examId/questions/:qid
   * Updates `text`/`orderIndex`, and—when `options` is supplied—replaces the
   * whole option set (requiring `correctOptionIndex`). Transactional.
   * @throws {NotFoundError}   when the question does not exist on this exam.
   * @throws {BadRequestError} on an invalid `correctOptionIndex`.
   */
  .patch(
    "/exams/:examId/questions/:qid",
    async ({ params, body }) => {
      const { examId, qid } = params;
      const existing = await db.query.questions.findFirst({
        columns: { id: true },
        where: and(eq(questions.id, qid), eq(questions.examId, examId)),
      });
      if (!existing) throw new NotFoundError("Soal tidak ditemukan.");

      const replacingOptions = body.options !== undefined;
      if (replacingOptions) {
        if (body.correctOptionIndex === undefined) {
          throw new BadRequestError(
            "correctOptionIndex wajib diisi saat mengganti opsi."
          );
        }
        if (body.options!.length < 2) {
          throw new BadRequestError(
            "Soal pilihan ganda harus memiliki minimal 2 opsi."
          );
        }
        if (body.correctOptionIndex >= body.options!.length) {
          throw new BadRequestError(
            "correctOptionIndex di luar jangkauan daftar opsi."
          );
        }
      }

      if (body.text !== undefined && findExternalMediaSrc(body.text) !== null) {
        throw new BadRequestError(
          "Media pada soal harus diunggah ke pustaka media; URL eksternal tidak diizinkan."
        );
      }

      const patch: Partial<typeof questions.$inferInsert> = {};
      if (body.text !== undefined) patch.text = body.text;
      if (body.orderIndex !== undefined) patch.orderIndex = body.orderIndex;
      if (body.type !== undefined) patch.type = body.type;
      if (body.config !== undefined) patch.config = body.config;

      await db.transaction(async (tx) => {
        const [active] = await tx
          .select({ id: examSessions.id })
          .from(examSessions)
          .where(and(eq(examSessions.examId, examId), eq(examSessions.submitted, 0), gt(examSessions.endTime, Date.now())))
          .limit(1);
        if (active) throw new ConflictError(ACTIVE_SESSIONS_ERROR);

        if (replacingOptions) {
          // Preserve option IDs positionally when the option count is unchanged.
          // Answers store `selected_option_id` (which has no FK), so regenerating
          // IDs on every edit silently orphaned already-recorded answers and
          // retroactively zeroed historical recap scores. Reusing the existing
          // IDs in order keeps those answers attached across a text / correct-
          // answer edit; IDs are only minted for a genuinely resized option set.
          const oldOpts = await tx
            .select({ id: options.id })
            .from(options)
            .where(eq(options.questionId, qid))
            .orderBy(asc(options.orderIndex));
          const reuseIds = oldOpts.length === body.options!.length;
          const rows = body.options!.map((o, index) => ({
            id: reuseIds ? oldOpts[index].id : randomUUID(),
            questionId: qid,
            text: o.text,
            orderIndex: index,
            imageUrl: o.imageUrl ?? null,
          }));
          patch.correctOptionId = rows[body.correctOptionIndex!].id;
          await tx.delete(options).where(eq(options.questionId, qid));
          await tx.insert(options).values(rows);
        }

        if (Object.keys(patch).length > 0) {
          await tx.update(questions).set(patch).where(eq(questions.id, qid));
        }
      });

      log.info("Question updated", { examId, questionId: qid });
      return getQuestionDetail(examId, qid);
    },
    {
      body: t.Object({
        text: t.Optional(t.String({ minLength: 1 })),
        orderIndex: t.Optional(t.Integer({ minimum: 0 })),
        type: t.Optional(t.Union([
          t.Literal("multiple_choice"),
          t.Literal("fill_in_blank"),
          t.Literal("matching"),
          t.Literal("sorting"),
        ])),
        config: t.Optional(t.Record(t.String(), t.Unknown())),
        options: t.Optional(
          t.Array(
            t.Object({
              text: t.String({ minLength: 1 }),
              imageUrl: t.Optional(t.Nullable(t.String({ maxLength: 500, pattern: "^/uploads/" }))),
            })
          )
        ),
        correctOptionIndex: t.Optional(t.Integer({ minimum: 0 })),
      }),
    }
  )

  /**
   * DELETE /api/admin/exams/:examId/questions/:qid
   * Deletes a question. Its options cascade via FK, but its answers do NOT
   * (`answers.question_id` is ON DELETE NO ACTION), so any already-recorded
   * answers are removed first — otherwise the delete fails the FK with an opaque
   * 500. Blocked while a session is live (answers are still being written).
   * @throws {NotFoundError} when the question does not exist on this exam.
   */
  .delete("/exams/:examId/questions/:qid", async ({ params }) => {
    const { examId, qid } = params;
    const existing = await db.query.questions.findFirst({
      columns: { id: true },
      where: and(eq(questions.id, qid), eq(questions.examId, examId)),
    });
    if (!existing) throw new NotFoundError("Soal tidak ditemukan.");

    await db.transaction(async (tx) => {
      const [active] = await tx
        .select({ id: examSessions.id })
        .from(examSessions)
        .where(and(eq(examSessions.examId, examId), eq(examSessions.submitted, 0), gt(examSessions.endTime, Date.now())))
        .limit(1);
      if (active) throw new ConflictError(ACTIVE_SESSIONS_ERROR);

      // Remove recorded answers for this question first (no cascade on the FK),
      // then the question itself (options cascade automatically).
      await tx.delete(answers).where(eq(answers.questionId, qid));
      await tx.delete(questions).where(eq(questions.id, qid));
    });

    notifyExamListChanged(await getExamGroupIds(examId));
    log.info("Question deleted", { examId, questionId: qid });
    return { success: true };
  });
