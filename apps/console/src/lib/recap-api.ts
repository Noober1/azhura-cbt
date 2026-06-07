/**
 * Azhura CBT Console — Aggregate Recap API client (#19).
 *
 * Typed wrappers over the admin recap routes (`/admin/recap/...`). Scores and
 * statistics are computed server-side; these calls only read. Errors propagate
 * to callers, which surface them via toasts.
 */

import api from "./api";
import { filenameFromContentDisposition } from "./download";
import type {
  ExamRecapQuery,
  ExamRecapResponse,
  StudentRecapQuery,
  StudentRecapResponse,
} from "../types";

/** A downloaded file: its bytes plus the server-provided filename. */
export interface DownloadedFile {
  blob: Blob;
  filename: string;
}

/** The recap export query (same filters as the recap, minus paging). */
export type ExamExportQuery = Omit<ExamRecapQuery, "page" | "limit">;
export type StudentExportQuery = Omit<StudentRecapQuery, "page" | "limit">;

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
};
