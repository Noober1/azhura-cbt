/**
 * Azhura CBT Console — Aggregate Recap API client (#19).
 *
 * Typed wrappers over the admin recap routes (`/admin/recap/...`). Scores and
 * statistics are computed server-side; these calls only read. Errors propagate
 * to callers, which surface them via toasts.
 */

import api from "./api";
import type {
  ExamRecapQuery,
  ExamRecapResponse,
  StudentRecapQuery,
  StudentRecapResponse,
} from "../types";

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
};
