/**
 * Azhura CBT Backend — Admin Aggregate Recap Routes (#19)
 *
 * Admin-only recap endpoints backing the console "Rekap Nilai" page. Scores are
 * computed server-side from stored answers (see `lib/recap.ts`); the answer key
 * (`correct_option_id`) is never exposed. Supervisors get no recap — these are
 * management/reporting views, so the whole group is `requireAdmin`-gated.
 *
 * Endpoints (under `/api/admin`):
 * - `GET /admin/recap/exams/:examId`            — per-exam recap (participants + stats).
 * - `GET /admin/recap/exams/:examId/export.xlsx`   — same data as an Excel file (#20).
 * - `GET /admin/recap/students/:studentId`         — per-student cross-exam history.
 * - `GET /admin/recap/students/:studentId/export.xlsx` — same data as an Excel file (#20).
 *
 * The JSON endpoints accept optional filters (group/exam, `from`/`to` session-start
 * range) and `page`/`limit` paging; the export endpoints take the same filters but
 * no paging (the whole filtered set is written). Bounds are clamped in `lib/recap.ts`.
 */

import { Elysia, t } from "elysia";
import { authPlugin } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import {
  collectExamRecap,
  collectStudentRecap,
  getExamRecap,
  getStudentRecap,
} from "../../lib/recap";
import {
  buildExamRecapWorkbook,
  buildStudentRecapWorkbook,
  slugifyFilename,
} from "../../lib/recap-export";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Wraps an xlsx buffer in a downloadable Response with an attachment filename.
 * Copies into a fresh `Uint8Array` because the Fetch `BodyInit` type requires an
 * `ArrayBuffer`-backed view, not a Node `Buffer` (same quirk as the HTTP bridge
 * in `index.ts`).
 */
const xlsxResponse = (body: Buffer, filename: string): Response =>
  new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });

/** Optional filters shared by the export endpoints' query schema. */
const exportExamQuery = t.Object({
  groupId: t.Optional(t.String()),
  from: t.Optional(t.Numeric()),
  to: t.Optional(t.Numeric()),
});
const exportStudentQuery = t.Object({
  examId: t.Optional(t.String()),
  from: t.Optional(t.Numeric()),
  to: t.Optional(t.Numeric()),
});

/** Current date as `YYYY-MM-DD` for export filenames. */
const today = (): string => new Date().toISOString().slice(0, 10);

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
   * GET /api/admin/recap/exams/:examId/export.xlsx
   * Streams the full (un-paginated) per-exam recap as an Excel file.
   * @throws {NotFoundError} when the exam does not exist.
   */
  .get(
    "/recap/exams/:examId/export.xlsx",
    async ({ params, query }) => {
      const data = await collectExamRecap(params.examId, {
        groupId: query.groupId,
        from: query.from,
        to: query.to,
      });
      const buffer = await buildExamRecapWorkbook(data);
      const filename = `rekap-ujian-${slugifyFilename(data.exam.title)}-${today()}.xlsx`;
      return xlsxResponse(buffer, filename);
    },
    { query: exportExamQuery }
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
  )

  /**
   * GET /api/admin/recap/students/:studentId/export.xlsx
   * Streams the full (un-paginated) per-student recap as an Excel file.
   * @throws {NotFoundError} when the student does not exist.
   */
  .get(
    "/recap/students/:studentId/export.xlsx",
    async ({ params, query }) => {
      const data = await collectStudentRecap(params.studentId, {
        examId: query.examId,
        from: query.from,
        to: query.to,
      });
      const buffer = await buildStudentRecapWorkbook(data);
      const filename = `rekap-siswa-${slugifyFilename(data.student.name)}-${today()}.xlsx`;
      return xlsxResponse(buffer, filename);
    },
    { query: exportStudentQuery }
  );
