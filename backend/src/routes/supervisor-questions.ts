/**
 * Azhura CBT Backend — Supervisor Question Management Routes (#85)
 *
 * Supervisors can CRUD questions only for exams they have been assigned to
 * by an admin (rows in `exam_supervisors`). Attempting to access an exam that
 * is not in the caller's assignment list returns 403. Admins use the separate
 * `/admin/exams/:examId/questions` endpoints and are unaffected.
 *
 * Endpoints (all require `role = supervisor`):
 * - `GET    /api/supervisor/exams`                             — assigned exams list
 * - `GET    /api/supervisor/exams/:examId/questions`           — list questions
 * - `POST   /api/supervisor/exams/:examId/questions`           — create question
 * - `PUT    /api/supervisor/exams/:examId/questions/:questionId` — replace question
 * - `DELETE /api/supervisor/exams/:examId/questions/:questionId` — delete question
 */

import { Elysia, t } from "elysia";
import { randomUUID } from "crypto";
import { and, asc, count, eq, gt, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { authPlugin } from "../middleware/requireAuth";
import type { JwtPayload } from "../middleware/requireAuth";
import type { SupervisorExamDetail } from "@azhura/shared";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../lib/errors";
import { findExternalMediaSrc } from "../lib/question-content";
import { notifyExamListChanged } from "../lib/exam-events";
import { createLogger } from "../lib/logger";

const { exams, examGroups, examSessions, examSupervisors, groups, questions, options } = schema;

const log = createLogger("SupervisorQuestion");

const ACTIVE_SESSIONS_ERROR =
  "Tidak dapat mengubah soal saat ada peserta sedang mengerjakan ujian.";

/** Throws 403 unless the caller is a supervisor. */
function requireSupervisor({ user }: { user: JwtPayload }): void {
  if (user.role !== "supervisor") {
    throw new ForbiddenError("Akses ditolak. Khusus supervisor.");
  }
}

/**
 * Validates that `examId` exists AND the calling supervisor is assigned to it.
 * @throws {NotFoundError}  when the exam does not exist.
 * @throws {ForbiddenError} when the supervisor is not assigned to the exam.
 */
async function assertAssigned(examId: string, userId: string): Promise<void> {
  const exam = await db.query.exams.findFirst({
    columns: { id: true },
    where: eq(exams.id, examId),
  });
  if (!exam) throw new NotFoundError("Ujian tidak ditemukan.");

  const assigned = await db.query.examSupervisors.findFirst({
    where: and(
      eq(examSupervisors.examId, examId),
      eq(examSupervisors.userId, userId)
    ),
  });
  if (!assigned) throw new ForbiddenError("Kamu tidak ditugaskan ke ujian ini.");
}

/** Group ids assigned to an exam — scopes the realtime exam-list notification. */
async function getExamGroupIds(examId: string): Promise<string[]> {
  const rows = await db
    .select({ groupId: examGroups.groupId })
    .from(examGroups)
    .where(eq(examGroups.examId, examId));
  return rows.map((r) => r.groupId);
}

/** Full question detail (text + options + answer key) for management views. */
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

export const supervisorQuestionRoutes = new Elysia({ prefix: "/supervisor" })
  .use(authPlugin)
  .onBeforeHandle(requireSupervisor)

  /**
   * GET /api/supervisor/exams
   *
   * Returns the exams the calling supervisor has been assigned to.
   */
  .get("/exams", async ({ user }) => {
    const rows = await db
      .select({
        id: exams.id,
        title: exams.title,
        durationMinutes: exams.durationMinutes,
        isActive: exams.isActive,
        passingGrade: exams.passingGrade,
        createdAt: exams.createdAt,
      })
      .from(examSupervisors)
      .innerJoin(exams, eq(exams.id, examSupervisors.examId))
      .where(eq(examSupervisors.userId, user.userId));

    return rows.map((r) => ({
      ...r,
      isActive: r.isActive === 1,
    }));
  })

  /**
   * GET /api/supervisor/exams/:examId
   *
   * Read-only exam context for the supervisor question page (#141): title,
   * duration, passing grade, status, expiry, allowed group names, and question
   * count. The access token is deliberately NOT included — supervisors must not
   * see it. Guarded by `assertAssigned`, so a supervisor not assigned to the
   * exam gets 403 (and a missing exam gets 404).
   */
  .get("/exams/:examId", async ({ params, user }): Promise<SupervisorExamDetail> => {
    await assertAssigned(params.examId, user.userId);

    const exam = await db.query.exams.findFirst({
      columns: {
        id: true,
        title: true,
        durationMinutes: true,
        isActive: true,
        expiredAt: true,
        passingGrade: true,
      },
      where: eq(exams.id, params.examId),
    });
    // assertAssigned already guarantees the exam exists; this satisfies the type
    // narrowing and guards against a delete racing between the two queries.
    if (!exam) throw new NotFoundError("Ujian tidak ditemukan.");

    const groupRows = await db
      .select({ name: groups.name })
      .from(examGroups)
      .innerJoin(groups, eq(groups.id, examGroups.groupId))
      .where(eq(examGroups.examId, params.examId))
      .orderBy(asc(groups.name));

    const [questionCountRow] = await db
      .select({ value: count() })
      .from(questions)
      .where(eq(questions.examId, params.examId));

    return {
      id: exam.id,
      title: exam.title,
      durationMinutes: exam.durationMinutes,
      isActive: exam.isActive === 1,
      expiredAt: exam.expiredAt.getTime(),
      passingGrade: exam.passingGrade,
      allowedGroupNames: groupRows.map((g) => g.name),
      questionCount: questionCountRow?.value ?? 0,
    };
  })

  /**
   * GET /api/supervisor/exams/:examId/questions
   *
   * Lists all questions with options and answer key for an assigned exam.
   */
  .get("/exams/:examId/questions", async ({ params, user }) => {
    await assertAssigned(params.examId, user.userId);

    const questionRows = await db
      .select({
        id: questions.id,
        text: questions.text,
        orderIndex: questions.orderIndex,
        correctOptionId: questions.correctOptionId,
        type: questions.type,
        config: questions.config,
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
          .where(inArray(options.questionId, questionRows.map((q) => q.id)))
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
      orderIndex: q.orderIndex,
      correctOptionId: q.correctOptionId,
      type: q.type,
      config: q.config,
      options: byQuestion.get(q.id) ?? [],
    }));
  })

  /**
   * POST /api/supervisor/exams/:examId/questions
   *
   * Creates a new multiple-choice question. The question is blocked when there
   * are active (in-progress) sessions on the exam.
   */
  .post(
    "/exams/:examId/questions",
    async ({ params, body, user, set }) => {
      const { examId } = params;
      await assertAssigned(examId, user.userId);

      const qType = body.type ?? "multiple_choice";
      const questionId = randomUUID();

      // `!== null` (not truthiness): an empty `src=""` is a non-/uploads value
      // that must also be rejected, and the empty string is falsy.
      if (findExternalMediaSrc(body.text) !== null) {
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
          if (!body.options || body.correctOptionIndex === undefined) {
            throw new BadRequestError("options dan correctOptionIndex wajib untuk soal pilihan ganda.");
          }
          if (body.options.length < 2) {
            throw new BadRequestError("Soal pilihan ganda harus memiliki minimal 2 opsi.");
          }
          if (body.correctOptionIndex >= body.options.length) {
            throw new BadRequestError("correctOptionIndex di luar jangkauan daftar opsi.");
          }
          const optionRows = body.options.map((o, index) => ({
            id: randomUUID(), questionId, text: o.text, orderIndex: index,
            imageUrl: o.imageUrl ?? null,
          }));
          const correctOptionId = optionRows[body.correctOptionIndex].id;
          await tx.insert(questions).values({
            id: questionId, examId, text: body.text, type: "multiple_choice",
            correctOptionId, orderIndex: body.orderIndex ?? 0,
          });
          await tx.insert(options).values(optionRows);
        } else {
          if (!body.config) throw new BadRequestError("config wajib untuk tipe soal ini.");
          await tx.insert(questions).values({
            id: questionId, examId, text: body.text, type: qType,
            config: body.config, orderIndex: body.orderIndex ?? 0,
          });
        }
      });

      notifyExamListChanged(await getExamGroupIds(examId));
      log.info("Question created by supervisor", { examId, questionId, type: qType, supervisorId: user.userId });
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
        options: t.Optional(
          t.Array(
            t.Object({
              text: t.String({ minLength: 1 }),
              imageUrl: t.Optional(t.Nullable(t.String({ maxLength: 500, pattern: "^/uploads/" }))),
            })
          )
        ),
        correctOptionIndex: t.Optional(t.Integer({ minimum: 0 })),
        config: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
    }
  )

  /**
   * PUT /api/supervisor/exams/:examId/questions/:questionId
   *
   * Full replacement of a question's text and options. Both `text`, `options`,
   * and `correctOptionIndex` are required. Blocked during active sessions.
   */
  .put(
    "/exams/:examId/questions/:questionId",
    async ({ params, body, user }) => {
      const { examId, questionId } = params;
      await assertAssigned(examId, user.userId);

      const existing = await db.query.questions.findFirst({
        columns: { id: true, type: true },
        where: and(eq(questions.id, questionId), eq(questions.examId, examId)),
      });
      if (!existing) throw new NotFoundError("Soal tidak ditemukan.");

      const qType = existing.type ?? "multiple_choice";

      // `!== null`: reject an empty `src=""` too (the empty string is falsy).
      if (findExternalMediaSrc(body.text) !== null) {
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
          if (!body.options || body.correctOptionIndex === undefined) {
            throw new BadRequestError("options dan correctOptionIndex wajib untuk soal pilihan ganda.");
          }
          if (body.options.length < 2) {
            throw new BadRequestError("Soal pilihan ganda harus memiliki minimal 2 opsi.");
          }
          if (body.correctOptionIndex >= body.options.length) {
            throw new BadRequestError("correctOptionIndex di luar jangkauan daftar opsi.");
          }
          const newOptionRows = body.options.map((o, index) => ({
            id: randomUUID(), questionId, text: o.text, orderIndex: index,
            imageUrl: o.imageUrl ?? null,
          }));
          const correctOptionId = newOptionRows[body.correctOptionIndex].id;
          await tx.update(questions)
            .set({ text: body.text, correctOptionId, orderIndex: body.orderIndex ?? 0 })
            .where(eq(questions.id, questionId));
          await tx.delete(options).where(eq(options.questionId, questionId));
          await tx.insert(options).values(newOptionRows);
        } else {
          if (!body.config) throw new BadRequestError("config wajib untuk tipe soal ini.");
          await tx.update(questions)
            .set({ text: body.text, config: body.config, orderIndex: body.orderIndex ?? 0 })
            .where(eq(questions.id, questionId));
        }
      });

      log.info("Question updated by supervisor", { examId, questionId, supervisorId: user.userId });
      return getQuestionDetail(examId, questionId);
    },
    {
      body: t.Object({
        text: t.String({ minLength: 1 }),
        orderIndex: t.Optional(t.Integer({ minimum: 0 })),
        options: t.Optional(
          t.Array(
            t.Object({
              text: t.String({ minLength: 1 }),
              imageUrl: t.Optional(t.Nullable(t.String({ maxLength: 500, pattern: "^/uploads/" }))),
            })
          )
        ),
        correctOptionIndex: t.Optional(t.Integer({ minimum: 0 })),
        config: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
    }
  )

  /**
   * DELETE /api/supervisor/exams/:examId/questions/:questionId
   *
   * Deletes a question; its options cascade via FK. Blocked during active sessions.
   */
  .delete("/exams/:examId/questions/:questionId", async ({ params, user }) => {
    const { examId, questionId } = params;
    await assertAssigned(examId, user.userId);

    const existing = await db.query.questions.findFirst({
      columns: { id: true },
      where: and(eq(questions.id, questionId), eq(questions.examId, examId)),
    });
    if (!existing) throw new NotFoundError("Soal tidak ditemukan.");

    await db.transaction(async (tx) => {
      const [active] = await tx
        .select({ id: examSessions.id })
        .from(examSessions)
        .where(
          and(
            eq(examSessions.examId, examId),
            eq(examSessions.submitted, 0),
            gt(examSessions.endTime, Date.now())
          )
        )
        .limit(1);
      if (active) throw new ConflictError(ACTIVE_SESSIONS_ERROR);

      await tx.delete(questions).where(eq(questions.id, questionId));
    });

    notifyExamListChanged(await getExamGroupIds(examId));
    log.info("Question deleted by supervisor", { examId, questionId, supervisorId: user.userId });
    return { success: true };
  });
