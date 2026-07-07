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
import { writeEventLog } from "../lib/log-files";
import { findActiveSession, finalizeSession, gradeQuestion } from "../lib/exam-scoring";
import { checkExamToken } from "../lib/exam-token";
import { mergeAnswer, isEmptyAnswer, type StoredAnswer } from "../lib/answer-merge";
import { sessionPermutation } from "../lib/session-shuffle";
import { notifyRosterPatch } from "../lib/roster-events";
import { buildRosterParticipant } from "../lib/roster";
import { shuffle, applyQuestionOrder } from "../lib/question-order";
import { dedupeAnswersByQuestion } from "../lib/answer-batch";
import { notifyDashboardStats } from "./admin/dashboard";

const { exams, questions, options, examSessions, answers, examGroups, examBatches, sessionQuestions } =
  schema;

const log = createLogger("Exam");

/**
 * Upper bound on answers accepted in one batch flush (#10). An honest client
 * never exceeds the question count; the cap is an abuse guard, not a limit on
 * legitimate use.
 */
const MAX_BATCH_ANSWERS = 500;

/**
 * Returns the list of batch numbers that are allowed to access an exam, or
 * `null` when the exam has no batch restrictions (open to all batches within
 * the allowed groups).
 */
async function getRestrictedBatches(examId: string): Promise<number[] | null> {
  const rows = await db
    .select({ batch: examBatches.batch })
    .from(examBatches)
    .where(eq(examBatches.examId, examId));
  return rows.length > 0 ? rows.map((r) => Number(r.batch)) : null;
}

/**
 * Rejects answers whose questionId does not belong to this exam. Guards against
 * a client stamping answers for another exam's questions (which the FK would
 * accept — a valid question id, wrong exam) or for a non-existent question
 * (which the FK would 500 on). One indexed lookup covers a whole batch.
 */
async function assertQuestionsBelongToExam(examId: string, questionIds: string[]): Promise<void> {
  if (questionIds.length === 0) return;
  const rows = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(eq(questions.examId, examId), inArray(questions.id, questionIds)));
  const valid = new Set(rows.map((r) => r.id));
  if (questionIds.some((id) => !valid.has(id))) {
    throw new BadRequestError("Jawaban memuat soal yang bukan milik ujian ini.");
  }
}

interface GradableQuestion {
  id: string;
  type: string | null;
  correctOptionId: string | null;
  config: unknown;
}

/**
 * Grades a set of questions against a map of effective answers (stored and/or
 * merged), returning the score envelope. Shared by the idempotent re-submit,
 * the expired-finalize, and the normal submit paths so they can never diverge.
 */
function gradeStored(
  sessionId: string,
  gradable: GradableQuestion[],
  answerByQuestion: Map<string, StoredAnswer>
): { score: number; totalCorrect: number; totalWrong: number; totalEmpty: number } {
  let totalCorrect = 0;
  let totalWrong = 0;
  let totalEmpty = 0;
  for (const q of gradable) {
    const ans = answerByQuestion.get(q.id);
    if (isEmptyAnswer(ans)) {
      totalEmpty++;
      continue;
    }
    gradeQuestion(q.type ?? "multiple_choice", q.correctOptionId, q.config, ans?.selectedOptionId ?? null, ans?.answerValue ?? null, { sessionId, questionId: q.id })
      ? totalCorrect++
      : totalWrong++;
  }
  const total = gradable.length;
  return {
    score: total > 0 ? Math.round((totalCorrect / total) * 100) : 0,
    totalCorrect,
    totalWrong,
    totalEmpty,
  };
}

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
      passingGrade: exams.passingGrade,
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
      // Scope the session join to THIS caller. Without the userId predicate the
      // join multiplied every exam's questions by every student's sessions
      // (questions × all sessions) before the aggregate collapsed them — a large
      // intermediate result on a busy exam. Only the caller's own submitted
      // session matters for the `completed` flag.
      .leftJoin(
        examSessions,
        and(eq(examSessions.examId, exams.id), eq(examSessions.userId, user.userId))
      );

    const scoped = restrictGroupId
      ? base.innerJoin(
          examGroups,
          and(
            eq(examGroups.examId, exams.id),
            eq(examGroups.groupId, restrictGroupId)
          )
        )
      : base;

    const rawExams = await scoped
      .where(eq(exams.isActive, 1))
      .groupBy(exams.id, exams.title, exams.durationMinutes, exams.passingGrade)
      .orderBy(asc(exams.createdAt));

    // Batch filtering for students: exams with batch restrictions only appear
    // for students whose `batch` value is listed in `exam_batches`. Exams with
    // no rows in `exam_batches` are available to all batches in the group.
    let filteredExams = rawExams;
    if (user.role === "student" && rawExams.length > 0) {
      const examIds = rawExams.map((e) => e.id);
      const batchRows = await db
        .select({ examId: examBatches.examId, batch: examBatches.batch })
        .from(examBatches)
        .where(inArray(examBatches.examId, examIds));
      const batchMap = new Map<string, number[]>();
      for (const row of batchRows) {
        if (!batchMap.has(row.examId)) batchMap.set(row.examId, []);
        batchMap.get(row.examId)!.push(Number(row.batch));
      }
      filteredExams = rawExams.filter((e) => {
        const allowed = batchMap.get(e.id);
        return !allowed || allowed.includes(user.batch ?? 1);
      });
    }

    return filteredExams.map((row) => ({
      id: row.id,
      title: row.title,
      totalQuestions: Number(row.totalQuestions),
      durationMinutes: row.durationMinutes,
      passingGrade: row.passingGrade,
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
      return {
        status: "finalized" as const,
        examTitle: active.examTitle,
        result: { ...result, passingGrade: active.passingGrade },
      };
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
      // Server clock so the resuming client can re-capture clock skew and keep its
      // offline-tolerant countdown aligned with the authoritative endTime (#8).
      serverTime: Date.now(),
    };
  })

  /**
   * GET /api/exams/:examId/questions
   * Returns the question list with options, grouped per question. The
   * `correctOptionId` column is deliberately never sent to the client.
   *
   * Ordering (#2 randomization):
   * - Question order follows the caller's in-progress session order persisted
   *   at first start (`session_questions`); with no such session/order it falls
   *   back to `questions.order_index`. This keeps the order stable across
   *   relogin/reconnect without ever reshuffling.
   * - Answer options are shuffled per request when the exam has
   *   `randomize_answer = 1`. Option order is never persisted: answers are keyed
   *   by `selected_option_id`, so reshuffling each load is safe.
   * @throws {NotFoundError} when the exam has no questions.
   */
  .get("/:examId/questions", async ({ params, user }) => {
    const { examId } = params;

    const exam = await db.query.exams.findFirst({
      columns: { randomizeAnswer: true },
      where: eq(exams.id, examId),
    });

    // Drizzle's relational `with` clause generates a LATERAL JOIN which MariaDB
    // does not support. Two plain queries + an in-memory merge is equivalent.
    const questionRows = await db
      .select({ id: questions.id, text: questions.text, type: questions.type, config: questions.config })
      .from(questions)
      .where(eq(questions.examId, examId))
      .orderBy(asc(questions.orderIndex));

    if (questionRows.length === 0) {
      throw new NotFoundError("Soal ujian tidak ditemukan.");
    }

    const questionById = new Map(questionRows.map((q) => [q.id, q] as const));
    const canonicalIds = questionRows.map((q) => q.id);

    // Reuse the persisted shuffled order from the caller's in-progress session
    // for this exam (if any) so relogin/reconnect replays the same order.
    const session = await db.query.examSessions.findFirst({
      columns: { id: true },
      where: and(
        eq(examSessions.userId, user.userId),
        eq(examSessions.examId, examId),
        eq(examSessions.submitted, 0)
      ),
      orderBy: (s, { desc }) => desc(s.createdAt),
    });

    // Access control: a student may only read an exam's questions while they
    // hold an in-progress session for it. Session creation is where the group,
    // batch, active-window, and access-token gates are enforced (see POST
    // /sessions) — without this check any authenticated student could pull the
    // full question content of any exam straight from the API, bypassing the
    // token gate entirely. Supervisors/admins are exempt (content preview).
    if (user.role === "student" && !session) {
      log.warn("Blocked questions read: no active session for student", {
        examId,
        userId: user.userId,
      });
      throw new ForbiddenError("Anda belum memulai ujian ini.");
    }

    let orderedIds = canonicalIds;
    if (session) {
      const persisted = await db
        .select({ questionId: sessionQuestions.questionId })
        .from(sessionQuestions)
        .where(eq(sessionQuestions.sessionId, session.id))
        .orderBy(asc(sessionQuestions.orderIndex));
      orderedIds = applyQuestionOrder(
        canonicalIds,
        persisted.map((p) => p.questionId)
      );
    }

    const optionRows = await db
      .select({
        id: options.id,
        questionId: options.questionId,
        text: options.text,
        imageUrl: options.imageUrl,
      })
      .from(options)
      .where(inArray(options.questionId, canonicalIds))
      .orderBy(asc(options.orderIndex));

    const optionsByQuestion = new Map<
      string,
      { id: string; text: string; imageUrl: string | null }[]
    >();
    for (const o of optionRows) {
      const bucket = optionsByQuestion.get(o.questionId) ?? [];
      bucket.push({ id: o.id, text: o.text, imageUrl: o.imageUrl });
      optionsByQuestion.set(o.questionId, bucket);
    }

    // correctOptionId intentionally excluded. config is sanitized per type so
    // the answer key never reaches the client:
    // - matching: left/right columns decoupled and the right column shuffled by
    //   a secret per-session permutation (the pairing is the answer key, so it
    //   must not be sent paired, and the identity mapping must not win).
    // - sorting:  items shuffled by the same per-session permutation and
    //   correctOrder stripped (authored order is the answer, so "already sorted"
    //   must not win).
    // - fill_in_blank: config omitted entirely (just a text input).
    // The permutation is keyed to this student's session so grading (which
    // re-derives it) matches; supervisors/admins previewing without a session
    // see the unshuffled identity order (they never submit answers).
    return orderedIds.map((id) => {
      const q = questionById.get(id)!;
      const opts = optionsByQuestion.get(id) ?? [];
      const qType = q.type ?? "multiple_choice";
      const rawConfig = typeof q.config === "string"
        ? (() => { try { return JSON.parse(q.config as string); } catch { return null; } })()
        : (q.config ?? null);

      let studentConfig: unknown = null;
      if (qType === "matching" && rawConfig) {
        const pairs = (rawConfig.pairs ?? []) as { left: string; right: string }[];
        const perm = session
          ? sessionPermutation(session.id, id, pairs.length)
          : pairs.map((_, i) => i);
        studentConfig = {
          left: pairs.map((p) => p.left),
          right: perm.map((k) => pairs[k].right),
        };
      } else if (qType === "sorting" && rawConfig) {
        const items = (rawConfig.items ?? []) as string[];
        const perm = session
          ? sessionPermutation(session.id, id, items.length)
          : items.map((_, i) => i);
        studentConfig = { items: perm.map((k) => items[k]) };
      }

      return {
        id,
        text: q.text,
        type: qType,
        config: studentConfig,
        options: qType === "multiple_choice"
          ? (exam?.randomizeAnswer ? shuffle(opts) : opts)
          : [],
      };
    });
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
      const { questionId, selectedOptionId, answerValue, timestamp, sessionId } = body;

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
      await assertQuestionsBelongToExam(examId, [questionId]);

      await db
        .insert(answers)
        .values({
          id: randomUUID(),
          sessionId,
          questionId,
          selectedOptionId: selectedOptionId ?? null,
          answerValue: answerValue ?? null,
          timestamp,
          isFlagged: 0,
        })
        .onDuplicateKeyUpdate({
          set: {
            selectedOptionId: selectedOptionId ?? null,
            answerValue: answerValue ?? null,
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
        answerValue: t.Optional(t.Nullable(t.String())),
        timestamp: t.Number(),
      }),
    }
  )

  /**
   * POST /api/exams/:examId/answers/batch
   * Flushes a batch of queued answers in one idempotent transaction — the
   * client uses this to drain its offline queue on reconnect (#10). Shares the
   * exact session guards as `/answer`; intra-batch duplicates are collapsed
   * (latest-per-question) before upserting via `uq_session_question`.
   * @throws {NotFoundError} session not found for this user/exam.
   * @throws {ConflictError} exam already submitted.
   * @throws {GoneError}     exam time has expired.
   */
  .post(
    "/:examId/answers/batch",
    async ({ params, body, user }) => {
      const { examId } = params;
      const { sessionId, answers: incoming } = body;

      // Same guards as the single-answer endpoint: ownership + still open.
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

      // Collapse duplicates so the transaction never writes a question twice.
      const deduped = dedupeAnswersByQuestion(incoming);
      await assertQuestionsBelongToExam(examId, deduped.map((a) => a.questionId));

      if (deduped.length > 0) {
        await db.transaction(async (tx) => {
          for (const ans of deduped) {
            await tx
              .insert(answers)
              .values({
                id: randomUUID(),
                sessionId,
                questionId: ans.questionId,
                selectedOptionId: ans.selectedOptionId,
                answerValue: ans.answerValue ?? null,
                timestamp: ans.timestamp,
                isFlagged: 0,
              })
              .onDuplicateKeyUpdate({
                set: {
                  selectedOptionId: ans.selectedOptionId,
                  answerValue: ans.answerValue ?? null,
                  timestamp: ans.timestamp,
                },
              });
          }
        });
      }

      return { success: true, count: deduped.length, timestamp: Date.now() };
    },
    {
      body: t.Object({
        sessionId: t.String(),
        answers: t.Array(
          t.Object({
            questionId: t.String(),
            selectedOptionId: t.Nullable(t.String()),
            answerValue: t.Optional(t.Nullable(t.String())),
            timestamp: t.Number(),
          }),
          { maxItems: MAX_BATCH_ANSWERS }
        ),
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
        columns: { id: true, submitted: true, endTime: true },
        where: and(
          eq(examSessions.id, sessionId),
          eq(examSessions.userId, user.userId),
          eq(examSessions.examId, examId)
        ),
      });

      if (!session) throw new NotFoundError("Sesi ujian tidak ditemukan.");

      const exam = await db.query.exams.findFirst({
        columns: { passingGrade: true },
        where: eq(exams.id, examId),
      });
      const passingGrade = exam?.passingGrade ?? 0;

      // Fetch all questions (with type + config — the answer key must never come
      // from the client) and the answers already stored server-side. Both feed
      // every branch below, so load them once.
      const allQuestions = await db
        .select({ id: questions.id, type: questions.type, correctOptionId: questions.correctOptionId, config: questions.config })
        .from(questions)
        .where(eq(questions.examId, examId));
      const storedRows = await db
        .select({ questionId: answers.questionId, selectedOptionId: answers.selectedOptionId, answerValue: answers.answerValue })
        .from(answers)
        .where(eq(answers.sessionId, sessionId));
      const storedByQuestion = new Map<string, StoredAnswer>(
        storedRows.map((a) => [a.questionId, { selectedOptionId: a.selectedOptionId ?? null, answerValue: a.answerValue ?? null }])
      );

      // Idempotent re-submit (#8): a retry — or a race with server-side
      // finalization (expiry/kick) — must not 409 the client into a stuck retry
      // loop. When the session is already submitted, re-grade the stored answers
      // and return the same score instead of erroring. The stored answers are
      // authoritative (the exam is over), so this is deterministic.
      if (session.submitted) {
        const graded = gradeStored(sessionId, allQuestions, storedByQuestion);
        log.info("Idempotent re-submit served from stored answers", { examId, sessionId, userId: user.userId });
        return { ...graded, passingGrade };
      }

      // The effective answer per question = the merge of the client payload over
      // the stored answers. A question the client omits keeps its autosaved
      // answer — the final submit must never wipe already-synced work.
      const effectiveByQuestion = new Map<string, StoredAnswer>();

      const expired = Date.now() > session.endTime;
      if (expired) {
        // Time is up: do NOT accept late client writes (the /answer endpoint
        // already rejects them). Finalize authoritatively from the stored
        // answers and mark the session submitted. This closes the window in
        // which a client could keep changing answers after the timer ran out.
        for (const q of allQuestions) {
          effectiveByQuestion.set(q.id, storedByQuestion.get(q.id) ?? { selectedOptionId: null, answerValue: null });
        }
        await db.update(examSessions).set({ submitted: 1 }).where(eq(examSessions.id, sessionId));
        log.info("Late submit finalized from stored answers (time expired)", { examId, sessionId, userId: user.userId });
      } else {
        // Persist only fresh client answers (merge, never null-overwrite) and
        // mark submitted atomically.
        const submittedByQuestion = new Map(submitted.map((a) => [a.questionId, a] as const));
        try {
          await db.transaction(async (tx) => {
            for (const q of allQuestions) {
              const { effective, toPersist } = mergeAnswer(submittedByQuestion.get(q.id), storedByQuestion.get(q.id));
              effectiveByQuestion.set(q.id, effective);
              if (!toPersist) continue;
              const row = {
                selectedOptionId: toPersist.selectedOptionId ?? null,
                answerValue: toPersist.answerValue ?? null,
                timestamp: toPersist.timestamp ?? Date.now(),
                isFlagged: toPersist.isFlagged ? 1 : 0,
              };
              await tx
                .insert(answers)
                .values({ id: randomUUID(), sessionId, questionId: q.id, ...row })
                .onDuplicateKeyUpdate({ set: row });
            }
            await tx.update(examSessions).set({ submitted: 1 }).where(eq(examSessions.id, sessionId));
          });
        } catch (error) {
          log.error("Exam submission transaction failed — rolled back", error, { examId, sessionId, userId: user.userId });
          throw error;
        }
      }

      // Grade from the effective (merged) answers.
      const result = gradeStored(sessionId, allQuestions, effectiveByQuestion);

      log.info("Exam submitted", {
        examId,
        sessionId,
        userId: user.userId,
        score: result.score,
      });
      writeEventLog(
        "exam_submit",
        `Selesai ujian (skor ${result.score})`,
        { examId, sessionId, score: result.score },
        { id: user.userId, role: user.role }
      );
      // Roster (#7): the exam is done, but the student is usually still logged
      // in — move them back to the "Dashboard" group (upsert resolves to a
      // dashboard entry now that no exam session is active). If their socket is
      // already gone, buildRosterParticipant returns null → remove them.
      void buildRosterParticipant(user.userId)
        .then((participant) => {
          notifyRosterPatch(
            participant
              ? { type: "upsert", participant }
              : { type: "remove", userId: user.userId }
          );
        })
        .catch((error) => {
          log.warn("Roster patch after submit failed", {
            userId: user.userId,
            reason: error instanceof Error ? error.message : String(error),
          });
        });
      void notifyDashboardStats().catch(() => {});
      return { ...result, passingGrade };
    },
    {
      body: t.Object({
        sessionId: t.String(),
        answers: t.Array(
          t.Object({
            questionId: t.String(),
            selectedOptionId: t.Nullable(t.String()),
            answerValue: t.Optional(t.Nullable(t.String())),
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
      columns: {
        id: true,
        title: true,
        durationMinutes: true,
        token: true,
        randomizeQuestion: true,
      },
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
    // expired-but-unsubmitted session is finalized here so it can never
    // permanently block the account.
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

      // Batch gate (#74): when `exam_batches` has rows for this exam, only
      // students whose `batch` value appears there may start a session.
      const allowedBatches = await getRestrictedBatches(examId);
      if (allowedBatches !== null && !allowedBatches.includes(user.batch ?? 1)) {
        log.warn("Blocked session: exam not allowed for student's batch", {
          examId,
          userId: user.userId,
          studentBatch: user.batch,
          allowedBatches,
        });
        throw new ForbiddenError("Ujian ini tidak tersedia untuk batch Anda.");
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

    // Question ids in their canonical (order_index) order. Used to size the
    // session and, when randomization is on, as the basis for the shuffled
    // order persisted below (#2).
    const questionIdRows = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.examId, examId))
      .orderBy(asc(questions.orderIndex));
    const questionIds = questionIdRows.map((q) => q.id);

    const sessionId = randomUUID();
    const now = Date.now();
    const endTime = now + exam.durationMinutes * 60 * 1000;

    // Persist the session and (when enabled) its one-time shuffled question
    // order atomically: a session must never exist without the order it was
    // created with, so relogin always replays the same sequence.
    const persistQuestionOrder = exam.randomizeQuestion === 1 && questionIds.length > 0;
    await db.transaction(async (tx) => {
      await tx.insert(examSessions).values({
        id: sessionId,
        examId,
        userId: user.userId,
        startTime: now,
        endTime,
      });

      if (persistQuestionOrder) {
        const shuffled = shuffle(questionIds);
        await tx.insert(sessionQuestions).values(
          shuffled.map((questionId, index) => ({
            sessionId,
            questionId,
            orderIndex: index,
          }))
        );
      }
    });

    log.info("Exam session created", {
      examId,
      sessionId,
      userId: user.userId,
      randomizedQuestions: persistQuestionOrder,
    });
    writeEventLog(
      "exam_start",
      `Mulai ujian: ${exam.title}`,
      { examId, sessionId, examTitle: exam.title },
      { id: user.userId, role: user.role }
    );

    // Roster (#7): push the new participant to supervisors. Built after insert so
    // it carries the live DB state; null only if the session vanished immediately.
    const rosterEntry = await buildRosterParticipant(user.userId);
    if (rosterEntry) {
      notifyRosterPatch({ type: "upsert", participant: rosterEntry });
    }
    void notifyDashboardStats().catch(() => {});

    return {
      id: sessionId,
      examId: exam.id,
      userId: user.userId,
      examTitle: exam.title,
      totalQuestions: questionIds.length,
      startTime: now,
      endTime,
      // Server clock at creation so the client can capture clock skew up front and
      // keep its offline-tolerant countdown aligned with this endTime (#8).
      serverTime: now,
    };
  }, {
    // Body is optional so open exams can post nothing; the token (when present)
    // is format/match-checked in the handler via checkExamToken for clear errors.
    body: t.Optional(t.Object({ token: t.Optional(t.String()) })),
  });
