/**
 * Azhura CBT Backend - Exam Routes (Drizzle)
 *
 * All routes require authentication (via {@link authPlugin}). Endpoints:
 * - `GET  /api/exams/:examId/questions` — questions + options (no correct answer).
 * - `POST /api/exams/:examId/answer`    — upsert a single answer in real time.
 * - `POST /api/exams/:examId/submit`    — final submission, scoring (transactional).
 * - `POST /api/exams/:examId/sessions`  — create a new timed exam session.
 *
 * Failure cases throw typed errors (NotFound/Conflict/Gone) that the central
 * handler maps to the correct HTTP status, keeping responses consistent.
 */

import { Elysia, t } from "elysia";
import { randomUUID } from "crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { authPlugin } from "../middleware/requireAuth";
import { NotFoundError, ConflictError, GoneError } from "../lib/errors";
import { createLogger } from "../lib/logger";

const { exams, questions, options, examSessions, answers } = schema;

const log = createLogger("Exam");

export const examRoutes = new Elysia({ prefix: "/exams" })
  .use(authPlugin)

  /**
   * GET /api/exams
   * Lists the active exams a student may take, with a live question count.
   * Returns summaries only — no question content or answer keys. Backs the
   * dashboard exam table (`AvailableExam[]` on the client).
   */
  .get("/", async () => {
    const rows = await db
      .select({
        id: exams.id,
        title: exams.title,
        durationMinutes: exams.durationMinutes,
        totalQuestions: sql<number>`count(${questions.id})`,
      })
      .from(exams)
      .leftJoin(questions, eq(questions.examId, exams.id))
      .where(eq(exams.isActive, 1))
      .groupBy(exams.id, exams.title, exams.durationMinutes)
      .orderBy(asc(exams.createdAt));

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      totalQuestions: Number(row.totalQuestions),
      durationMinutes: row.durationMinutes,
    }));
  })

  /**
   * GET /api/exams/:examId/questions
   * Returns the question list with options, grouped per question. The
   * `correctOptionId` column is deliberately never sent to the client.
   * @throws {NotFoundError} when the exam has no questions.
   */
  .get("/:examId/questions", async ({ params }) => {
    const { examId } = params;

    // Drizzle's relational `with` clause generates a LATERAL JOIN which MariaDB
    // does not support. Two plain queries + an in-memory merge is equivalent.
    const questionRows = await db
      .select({ id: questions.id, text: questions.text })
      .from(questions)
      .where(eq(questions.examId, examId))
      .orderBy(asc(questions.orderIndex));

    if (questionRows.length === 0) {
      throw new NotFoundError("Soal ujian tidak ditemukan.");
    }

    const questionIds = questionRows.map((q) => q.id);

    const optionRows = await db
      .select({ id: options.id, questionId: options.questionId, text: options.text })
      .from(options)
      .where(inArray(options.questionId, questionIds))
      .orderBy(asc(options.id));

    const optionsByQuestion = new Map<string, { id: string; text: string }[]>();
    for (const o of optionRows) {
      const bucket = optionsByQuestion.get(o.questionId) ?? [];
      bucket.push({ id: o.id, text: o.text });
      optionsByQuestion.set(o.questionId, bucket);
    }

    // correctOptionId intentionally excluded from the projection above.
    return questionRows.map((q) => ({
      id: q.id,
      text: q.text,
      options: optionsByQuestion.get(q.id) ?? [],
    }));
  })

  /**
   * POST /api/exams/:examId/answer
   * Upserts a single answer for an in-progress session (offline-first sync).
   * @throws {NotFoundError} session not found for this user/exam.
   * @throws {ConflictError} exam already submitted.
   * @throws {GoneError}     exam time has expired.
   */
  .post(
    "/:examId/answer",
    async ({ params, body, user }) => {
      const { examId } = params;
      const { questionId, selectedOptionId, timestamp, sessionId } = body;

      // Verify the session belongs to this user and is still open.
      const session = await db.query.examSessions.findFirst({
        columns: { id: true, endTime: true, submitted: true },
        where: and(
          eq(examSessions.id, sessionId),
          eq(examSessions.userId, user.userId),
          eq(examSessions.examId, examId)
        ),
      });

      if (!session) throw new NotFoundError("Sesi ujian tidak ditemukan.");
      if (session.submitted) throw new ConflictError("Ujian sudah dikumpulkan.");
      if (Date.now() > session.endTime) {
        throw new GoneError("Waktu ujian sudah habis.");
      }

      await db
        .insert(answers)
        .values({
          id: randomUUID(),
          sessionId,
          questionId,
          selectedOptionId: selectedOptionId ?? null,
          timestamp,
          isFlagged: 0,
        })
        .onDuplicateKeyUpdate({
          set: {
            selectedOptionId: selectedOptionId ?? null,
            timestamp,
          },
        });

      return { success: true, timestamp: Date.now() };
    },
    {
      body: t.Object({
        sessionId: t.String(),
        questionId: t.String(),
        selectedOptionId: t.Nullable(t.String()),
        timestamp: t.Number(),
      }),
    }
  )

  /**
   * POST /api/exams/:examId/submit
   * Final submission: persists every answer and computes the score inside a
   * single transaction (so a partial failure rolls back cleanly), then marks the
   * session submitted.
   * @returns `{ score, totalCorrect, totalWrong, totalEmpty }`.
   * @throws {NotFoundError} session not found.
   * @throws {ConflictError} exam already submitted.
   */
  .post(
    "/:examId/submit",
    async ({ params, body, user }) => {
      const { examId } = params;
      const { answers: submitted, sessionId } = body;

      const session = await db.query.examSessions.findFirst({
        columns: { id: true, submitted: true },
        where: and(
          eq(examSessions.id, sessionId),
          eq(examSessions.userId, user.userId),
          eq(examSessions.examId, examId)
        ),
      });

      if (!session) throw new NotFoundError("Sesi ujian tidak ditemukan.");
      if (session.submitted) {
        throw new ConflictError("Ujian sudah dikumpulkan sebelumnya.");
      }

      // Fetch the answer key from the DB (never trust client-provided correctness).
      const key = await db
        .select({
          id: questions.id,
          correctOptionId: questions.correctOptionId,
        })
        .from(questions)
        .where(eq(questions.examId, examId));

      const totalQuestions = key.length;
      const answerByQuestion = new Map(submitted.map((a) => [a.questionId, a]));

      let totalCorrect = 0;
      let totalWrong = 0;
      let totalEmpty = 0;

      // Persist all answers and grade them atomically.
      try {
        await db.transaction(async (tx) => {
          for (const q of key) {
            const ans = answerByQuestion.get(q.id);
            const selected = ans?.selectedOptionId ?? null;

            await tx
              .insert(answers)
              .values({
                id: randomUUID(),
                sessionId,
                questionId: q.id,
                selectedOptionId: selected,
                timestamp: ans?.timestamp ?? Date.now(),
                isFlagged: ans?.isFlagged ? 1 : 0,
              })
              .onDuplicateKeyUpdate({
                set: {
                  selectedOptionId: selected,
                  timestamp: ans?.timestamp ?? Date.now(),
                  isFlagged: ans?.isFlagged ? 1 : 0,
                },
              });

            if (!selected) {
              totalEmpty++;
            } else if (selected === q.correctOptionId) {
              totalCorrect++;
            } else {
              totalWrong++;
            }
          }

          await tx
            .update(examSessions)
            .set({ submitted: 1 })
            .where(eq(examSessions.id, sessionId));
        });
      } catch (error) {
        // Transaction auto-rolls back; log with context so the 500 is traceable.
        log.error("Exam submission transaction failed — rolled back", error, {
          examId,
          sessionId,
          userId: user.userId,
        });
        throw error;
      }

      // Guard against division by zero if an exam somehow has no questions.
      const score =
        totalQuestions > 0
          ? Math.round((totalCorrect / totalQuestions) * 100)
          : 0;

      log.info("Exam submitted", { examId, sessionId, userId: user.userId, score });
      return { score, totalCorrect, totalWrong, totalEmpty };
    },
    {
      body: t.Object({
        sessionId: t.String(),
        answers: t.Array(
          t.Object({
            questionId: t.String(),
            selectedOptionId: t.Nullable(t.String()),
            timestamp: t.Number(),
            isFlagged: t.Boolean(),
          })
        ),
      }),
    }
  )

  /**
   * POST /api/exams/:examId/sessions
   * Creates a new timed session for the active exam and returns its metadata
   * (including computed `endTime`).
   * @throws {NotFoundError} when the exam does not exist or is inactive.
   */
  .post("/:examId/sessions", async ({ params, user }) => {
    const { examId } = params;

    const exam = await db.query.exams.findFirst({
      columns: { id: true, title: true, durationMinutes: true },
      where: and(eq(exams.id, examId), eq(exams.isActive, 1)),
    });

    if (!exam) throw new NotFoundError("Ujian tidak ditemukan atau tidak aktif.");

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(questions)
      .where(eq(questions.examId, examId));

    const sessionId = randomUUID();
    const now = Date.now();
    const endTime = now + exam.durationMinutes * 60 * 1000;

    await db.insert(examSessions).values({
      id: sessionId,
      examId,
      userId: user.userId,
      startTime: now,
      endTime,
    });

    log.info("Exam session created", { examId, sessionId, userId: user.userId });
    return {
      id: sessionId,
      examId: exam.id,
      userId: user.userId,
      examTitle: exam.title,
      totalQuestions: Number(total),
      startTime: now,
      endTime,
    };
  });
