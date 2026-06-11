/**
 * Azhura CBT Backend — Admin Exam-Supervisor Assignment Routes (#83)
 *
 * Manages the many-to-many between supervisors and exams: which supervisors
 * are authorized to enter and edit questions for a given exam. Endpoints
 * (all admin-only, under `/api/admin`):
 *
 * - `GET    /admin/exams/:examId/supervisors`            — list assigned supervisors
 * - `POST   /admin/exams/:examId/supervisors`            — assign a supervisor
 * - `DELETE /admin/exams/:examId/supervisors/:userId`    — unassign a supervisor
 *
 * The supervisor list itself (`GET /admin/supervisors`) lives in `supervisors.ts`
 * (#140) — the single source for both the management page and this picker. It is
 * intentionally NOT defined here to avoid two handlers on the same path.
 */

import { Elysia, t } from "elysia";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { authPlugin } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors";
import { createLogger } from "../../lib/logger";

const { examSupervisors, users, exams } = schema;

const log = createLogger("AdminExamSupervisors");

export const adminExamSupervisorRoutes = new Elysia({ prefix: "/admin" })
  .use(authPlugin)
  .onBeforeHandle(requireAdmin)

  /**
   * GET /api/admin/exams/:examId/supervisors
   *
   * Returns the list of supervisors currently assigned to the exam,
   * each enriched with their display name and NIS.
   */
  .get("/exams/:examId/supervisors", async ({ params }) => {
    const { examId } = params;

    const exam = await db.query.exams.findFirst({
      columns: { id: true },
      where: eq(exams.id, examId),
    });
    if (!exam) throw new NotFoundError("Ujian tidak ditemukan.");

    const rows = await db
      .select({
        userId: examSupervisors.userId,
        name: users.name,
        nis: users.nis,
      })
      .from(examSupervisors)
      .innerJoin(users, eq(users.id, examSupervisors.userId))
      .where(eq(examSupervisors.examId, examId));

    return rows.map((r) => ({ examId, userId: r.userId, name: r.name, nis: r.nis }));
  })

  /**
   * POST /api/admin/exams/:examId/supervisors
   *
   * Assigns a supervisor to an exam. The target user must already exist and
   * have `role = 'supervisor'`. Assigning the same supervisor twice is a 409.
   */
  .post(
    "/exams/:examId/supervisors",
    async ({ params, body }) => {
      const { examId } = params;
      const { userId } = body;

      const [exam, supervisor] = await Promise.all([
        db.query.exams.findFirst({ columns: { id: true }, where: eq(exams.id, examId) }),
        db.query.users.findFirst({
          columns: { id: true, role: true },
          where: eq(users.id, userId),
        }),
      ]);

      if (!exam) throw new NotFoundError("Ujian tidak ditemukan.");
      if (!supervisor) throw new NotFoundError("Pengguna tidak ditemukan.");
      if (supervisor.role !== "supervisor")
        throw new BadRequestError("Pengguna bukan supervisor.");

      const existing = await db.query.examSupervisors.findFirst({
        where: and(
          eq(examSupervisors.examId, examId),
          eq(examSupervisors.userId, userId)
        ),
      });
      if (existing) throw new ConflictError("Supervisor sudah ditugaskan ke ujian ini.");

      await db.insert(examSupervisors).values({ examId, userId });
      log.info("Supervisor assigned to exam", { examId, userId });

      return { examId, userId };
    },
    { body: t.Object({ userId: t.String({ minLength: 1 }) }) }
  )

  /**
   * DELETE /api/admin/exams/:examId/supervisors/:userId
   *
   * Removes a supervisor assignment from an exam. Returns 404 if the
   * assignment does not exist.
   */
  .delete("/exams/:examId/supervisors/:userId", async ({ params }) => {
    const { examId, userId } = params;

    const existing = await db.query.examSupervisors.findFirst({
      where: and(
        eq(examSupervisors.examId, examId),
        eq(examSupervisors.userId, userId)
      ),
    });
    if (!existing) throw new NotFoundError("Penugasan supervisor tidak ditemukan.");

    await db
      .delete(examSupervisors)
      .where(
        and(eq(examSupervisors.examId, examId), eq(examSupervisors.userId, userId))
      );

    log.info("Supervisor unassigned from exam", { examId, userId });
    return { success: true };
  });
