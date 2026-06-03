/**
 * Azhura CBT Console — Admin Exams/Questions API client.
 *
 * Thin typed wrappers over the `/admin/exams` routes. All calls go through the
 * shared axios instance (JWT + 401 handling). Errors propagate to callers, which
 * surface them via toasts.
 */

import api from "./api";
import type {
  ExamCreateInput,
  ExamDetail,
  ExamListResponse,
  ExamUpdateInput,
  QuestionCreateInput,
  QuestionUpdateInput,
} from "../types";

export interface ListExamsParams {
  q?: string;
  page?: number;
  limit?: number;
}

export const examsApi = {
  async list(params: ListExamsParams): Promise<ExamListResponse> {
    const { data } = await api.get<ExamListResponse>("/admin/exams", { params });
    return data;
  },

  async get(examId: string): Promise<ExamDetail> {
    const { data } = await api.get<ExamDetail>(`/admin/exams/${examId}`);
    return data;
  },

  async create(input: ExamCreateInput): Promise<ExamDetail> {
    const { data } = await api.post<ExamDetail>("/admin/exams", input);
    return data;
  },

  async update(examId: string, input: ExamUpdateInput): Promise<ExamDetail> {
    const { data } = await api.patch<ExamDetail>(`/admin/exams/${examId}`, input);
    return data;
  },

  async remove(examId: string): Promise<void> {
    await api.delete(`/admin/exams/${examId}`);
  },

  async createQuestion(examId: string, input: QuestionCreateInput) {
    const { data } = await api.post(`/admin/exams/${examId}/questions`, input);
    return data;
  },

  async updateQuestion(examId: string, qid: string, input: QuestionUpdateInput) {
    const { data } = await api.patch(`/admin/exams/${examId}/questions/${qid}`, input);
    return data;
  },

  async removeQuestion(examId: string, qid: string): Promise<void> {
    await api.delete(`/admin/exams/${examId}/questions/${qid}`);
  },
};
