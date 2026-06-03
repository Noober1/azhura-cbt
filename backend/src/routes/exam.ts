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
import {
  NotFoundError,
  ConflictError,
  GoneError,
  ForbiddenError,
  BadRequestError,
} from "../lib/errors";
import { createLogger } from "../lib/logger";
import { gradeAgainstKey, findActiveSession, finalizeSession } from "../lib/exam-scoring";
import { checkExamToken } from "../lib/exam-token";

const { exams, questions, options, examSessions, answers, examGroups } = schema;

const log = createLogger("Exam");

export const examRoutes = new Elysia({ prefix: "/exams" })
  .use(authPlugin)

  /**
   * GET /api/exams
   * Lists the active exams the caller may take, with a live question count.
   * Students only see exams whose allowed groups (`exam_groups`) include their
   * own group; supervisors/admins see every active exam. Returns summaries
   * only — no question content or answer keys. Backs the dashboard exam table
   * (`AvailableExam[]` on the client).
   */
  .get("/", async ({ user }) => {
    // Students are scoped to their own group (carried on the JWT); a student
    // with no group sees nothing. Supervisors/admins see every active exam.
    let restrictGroupId: string | null = null;
    if (user.role === "student") {
      restrictGroupId = user.groupId || null;
      if (!restrictGroupId) return [];
    }

    const projection = {
      id: exams.id,
      title: exams.title,
      durationMinutes: exams.durationMinutes,
      totalQuestions: sql<number>`count(distinct ${questions.id})`,
      // 1 when the caller has any submitted session for this exam (joined below).
      // max(case ...) collapses the per-session rows the join multiplies out.
      completed: sql<number>`max(case when ${examSessions.userId} = ${user.userId} and ${examSessions.submitted} = 1 then 1 else 0 end)`,
      // 1 when the exam is token-gated. The raw token is deliberately never
      // projected/returned — only this boolean is exposed to the client (#1).
      requiresToken: sql<number>`(${exams.token} is not null)`,
    };

    const base = db
      .select(projection)
      .from(exams)
      .leftJoin(questions, eq(questions.examId, exams.id))
      .leftJoin(examSessions, eq(examSessions.examId, exams.id));

    const scoped = restrictGroupId
      ? base.innerJoin(
          examGroups,
          and(
            eq(examGroups.examId, exams.id),
            eq(examGroups.groupId, restrictGroupId)
          )
        )
      : base;

    const rows = await scoped
      .where(eq(exams.isActive, 1))
      .groupBy(exams.id, exams.title, exams.durationMinutes)
      .orderBy(asc(exams.createdAt));

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      totalQuestions: Number(row.totalQuestions),
      durationMinutes: row.durationMinutes,
      completed: Number(row.completed) === 1,
      requiresToken: Number(row.requiresToken) === 1,
    }));
  })

  /**
   * GET /api/exams/sessions/active
   * Authoritative check for the caller's in-progress exam session (#4 resume).
   * - No unsubmitted session            → `{ status: "none" }`.
   * - Unsubmitted & time remaining      → `{ status: "resume", session }` (client → /exam).
   * - Unsubmitted but `endTime` elapsed → finalize server-side & return
   *   `{ status: "finalized", examTitle, result }` (client → /result).
   *
   * Static path; declared before `/:examId/questions` for clarity (it cannot be
   * captured by that route since the second segment differs).
   */
  .get("/sessions/active", async ({ user }) => {
    const active = await findActiveSession(user.userId);
    if (!active) return { status: "none" as const };

    if (Date.now() > active.endTime) {
      const result = await finalizeSession(active);
      return { status: "finalized" as const, examTitle: active.examTitle, result };
    }

    return {
      status: "resume" as const,
      session: {
        id: active.id,
        examId: active.examId,
        userId: user.userId,
        examTitle: active.examTitle,
        totalQuestions: active.totalQuestions,
        startTime: active.startTime,
        endTime: active.endTime,
      },
    };
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

      const answerByQuestion = new Map(submitted.map((a) => [a.questionId, a]));

      // Persist all answers and mark submitted atomically.
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

      // Grade from the same key + selections (shared with expired-session
      // finalization in lib/exam-scoring.ts so both paths score identically).
      const selectedByQuestion = new Map<string, string | null>(
        key.map((q) => [q.id, answerByQuestion.get(q.id)?.selectedOptionId ?? null])
      );
      const result = gradeAgainstKey(key, selectedByQuestion);

      log.info("Exam submitted", {
        examId,
        sessionId,
        userId: user.userId,
        score: result.score,
      });
      return result;
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
   * @throws {ForbiddenError} when a student's group isn't allowed this exam, or
   *   the exam's access token is required and the supplied one doesn't match.
   * @throws {BadRequestError} when a required token is missing or malformed.
   */
  .post("/:examId/sessions", async ({ params, user, body }) => {
    const { examId } = params;

    const exam = await db.query.exams.findFirst({
      columns: { id: true, title: true, durationMinutes: true, token: true },
      where: and(eq(exams.id, examId), eq(exams.isActive, 1)),
    });

    if (!exam) throw new NotFoundError("Ujian tidak ditemukan atau tidak aktif.");

    // A submitted exam may never be retaken. Authoritative backstop for the
    // dashboard's disabled "Mulai Ujian" button — also guards direct API calls.
    const alreadyCompleted = await db.query.examSessions.findFirst({
      columns: { id: true },
      where: and(
        eq(examSessions.userId, user.userId),
        eq(examSessions.examId, examId),
        eq(examSessions.submitted, 1)
      ),
    });
    if (alreadyCompleted) {
      throw new ConflictError(
        "Anda sudah menyelesaikan ujian ini dan tidak dapat mengulanginya."
      );
    }

    // Block starting another exam while one is still in progress (#4). An
    // expired-but-unsubmitted session is finalized here first so it can never
    // permanently block the account (the resume guard would route the student
    // to /result for it; this is the authoritative backstop for direct calls).
    const inProgress = await findActiveSession(user.userId);
    if (inProgress) {
      if (Date.now() <= inProgress.endTime) {
        throw new ConflictError(
          "Anda masih memiliki ujian yang sedang berlangsung. Selesaikan ujian tersebut dahulu."
        );
      }
      await finalizeSession(inProgress);
    }

    // Students may only start exams allowed for their group. The listing in
    // GET /exams already filters by group, but this guards direct calls by
    // exam id. Supervisors/admins are exempt.
    if (user.role === "student") {
      const groupId = user.groupId || null;
      const allowed =
        groupId !== null &&
        (await db.query.examGroups.findFirst({
          columns: { examId: true },
          where: and(
            eq(examGroups.examId, examId),
            eq(examGroups.groupId, groupId)
          ),
        })) !== undefined;

      if (!allowed) {
        log.warn("Blocked session: exam not allowed for student's group", {
          examId,
          userId: user.userId,
          groupId,
        });
        throw new ForbiddenError("Ujian ini tidak tersedia untuk kelas Anda.");
      }
    }

    // Access-token gate (#1): a token-protected exam requires an exact,
    // case-sensitive, alphanumeric match before a session can be created. The
    // raw token never leaves the server — only verified here.
    switch (checkExamToken(exam.token, body?.token)) {
      case "missing":
        throw new BadRequestError("Token akses ujian wajib diisi.");
      case "invalid_format":
        throw new BadRequestError(
          "Token hanya boleh berisi huruf dan angka, maksimal 5 karakter."
        );
      case "mismatch":
        log.warn("Blocked session: wrong exam access token", {
          examId,
          userId: user.userId,
        });
        throw new ForbiddenError("Token akses ujian salah.");
    }

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
  }, {
    // Body is optional so open exams can post nothing; the token (when present)
    // is format/match-checked in the handler via checkExamToken for clear errors.
    body: t.Optional(t.Object({ token: t.Optional(t.String()) })),
  });
