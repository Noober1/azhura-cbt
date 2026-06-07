/**
 * Azhura CBT Backend — Admin Aggregate Recap Routes (#19)
 *
 * Admin-only recap endpoints backing the console "Rekap Nilai" page. Scores are
 * computed server-side from stored answers (see `lib/recap.ts`); the answer key
 * (`correct_option_id`) is never exposed. Supervisors get no recap — these are
 * management/reporting views, so the whole group is `requireAdmin`-gated.
 *
 * Endpoints (under `/api/admin`):
 * - `GET /admin/recap/exams/:examId`     — per-exam recap (participants + stats).
 * - `GET /admin/recap/students/:studentId` — per-student cross-exam history.
 *
 * Both accept optional filters (group/exam, `from`/`to` session-start range) and
 * `page`/`limit` paging; bounds are clamped inside `lib/recap.ts`.
 */

import { Elysia, t } from "elysia";
import { authPlugin } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { getExamRecap, getStudentRecap } from "../../lib/recap";

export const adminRecapRoutes = new Elysia({ prefix: "/admin" })
  .use(authPlugin)
  .onBeforeHandle(requireAdmin)

  /**
   * GET /api/admin/recap/exams/:examId
   * Per-exam recap: paginated participants with scores + class statistics.
   * @throws {NotFoundError} when the exam does not exist.
   */
  .get(
    "/recap/exams/:examId",
    ({ params, query }) =>
      getExamRecap(params.examId, {
        groupId: query.groupId,
        from: query.from,
        to: query.to,
        page: query.page,
        limit: query.limit,
      }),
    {
      query: t.Object({
        groupId: t.Optional(t.String()),
        from: t.Optional(t.Numeric()),
        to: t.Optional(t.Numeric()),
        page: t.Optional(t.Numeric()),
        limit: t.Optional(t.Numeric()),
      }),
    }
  )

  /**
   * GET /api/admin/recap/students/:studentId
   * Per-student recap: paginated exam history with scores + summary stats.
   * @throws {NotFoundError} when the student does not exist.
   */
  .get(
    "/recap/students/:studentId",
    ({ params, query }) =>
      getStudentRecap(params.studentId, {
        examId: query.examId,
        from: query.from,
        to: query.to,
        page: query.page,
        limit: query.limit,
      }),
    {
      query: t.Object({
        examId: t.Optional(t.String()),
        from: t.Optional(t.Numeric()),
        to: t.Optional(t.Numeric()),
        page: t.Optional(t.Numeric()),
        limit: t.Optional(t.Numeric()),
      }),
    }
  );
