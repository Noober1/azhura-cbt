/**
 * Azhura CBT Console — Aggregate Recap API client (#19, #21).
 *
 * Typed wrappers over the admin recap routes (`/admin/recap/...`). Scores and
 * statistics are computed server-side; these calls only read. Errors propagate
 * to callers, which surface them via toasts.
 *
 * `examRecapAll` / `studentRecapAll` collect all pages for print (#21).
 */

import api from "./api";
import { filenameFromContentDisposition } from "./download";
import type {
  ExamRecapQuery,
  ExamRecapResponse,
  StudentRecapQuery,
  StudentRecapResponse,
} from "../types";
import type { ExamPrintData, StudentPrintData } from "./print-utils";

/** A downloaded file: its bytes plus the server-provided filename. */
export interface DownloadedFile {
  blob: Blob;
  filename: string;
}

/** The recap export query (same filters as the recap, minus paging). */
export type ExamExportQuery = Omit<ExamRecapQuery, "page" | "limit">;
export type StudentExportQuery = Omit<StudentRecapQuery, "page" | "limit">;

/** Max rows per page when collecting all pages (backend cap is 200). */
const COLLECT_LIMIT = 200;

export const recapApi = {
  /** Per-exam recap: participants with scores + class statistics. */
  async examRecap(
    examId: string,
    params: ExamRecapQuery = {}
  ): Promise<ExamRecapResponse> {
    const { data } = await api.get<ExamRecapResponse>(
      `/admin/recap/exams/${examId}`,
      { params }
    );
    return data;
  },

  /** Per-student recap: exam history with scores + summary statistics. */
  async studentRecap(
    studentId: string,
    params: StudentRecapQuery = {}
  ): Promise<StudentRecapResponse> {
    const { data } = await api.get<StudentRecapResponse>(
      `/admin/recap/students/${studentId}`,
      { params }
    );
    return data;
  },

  /** Downloads the per-exam recap as an Excel (.xlsx) file (#20). */
  async examRecapXlsx(
    examId: string,
    params: ExamExportQuery = {}
  ): Promise<DownloadedFile> {
    const res = await api.get<Blob>(`/admin/recap/exams/${examId}/export.xlsx`, {
      params,
      responseType: "blob",
    });
    return {
      blob: res.data,
      filename: filenameFromContentDisposition(
        res.headers["content-disposition"],
        `rekap-ujian-${examId}.xlsx`
      ),
    };
  },

  /** Downloads the per-student recap as an Excel (.xlsx) file (#20). */
  async studentRecapXlsx(
    studentId: string,
    params: StudentExportQuery = {}
  ): Promise<DownloadedFile> {
    const res = await api.get<Blob>(
      `/admin/recap/students/${studentId}/export.xlsx`,
      { params, responseType: "blob" }
    );
    return {
      blob: res.data,
      filename: filenameFromContentDisposition(
        res.headers["content-disposition"],
        `rekap-siswa-${studentId}.xlsx`
      ),
    };
  },

  /**
   * Collects ALL participants for a per-exam recap (no pagination) for print (#21).
   * Iterates pages until every row is fetched.
   */
  async examRecapAll(examId: string, filters: ExamExportQuery = {}): Promise<ExamPrintData> {
    const participants: ExamPrintData["participants"] = [];
    let page = 1;
    let first: ExamRecapResponse | null = null;

    while (true) {
      const res = await recapApi.examRecap(examId, {
        ...filters,
        page,
        limit: COLLECT_LIMIT,
      });
      if (!first) first = res;
      participants.push(...res.participants);
      if (res.participants.length === 0 || participants.length >= res.total) break;
      page++;
    }

    return {
      exam: first!.exam,
      stats: first!.stats,
      participants,
    };
  },

  /**
   * Collects ALL history entries for a per-student recap (no pagination) for print (#21).
   * Iterates pages until every row is fetched.
   */
  async studentRecapAll(studentId: string, filters: StudentExportQuery = {}): Promise<StudentPrintData> {
    const history: StudentPrintData["history"] = [];
    let page = 1;
    let first: StudentRecapResponse | null = null;

    while (true) {
      const res = await recapApi.studentRecap(studentId, {
        ...filters,
        page,
        limit: COLLECT_LIMIT,
      });
      if (!first) first = res;
      history.push(...res.history);
      if (res.history.length === 0 || history.length >= res.total) break;
      page++;
    }

    return {
      student: first!.student,
      stats: first!.stats,
      history,
    };
  },
};
