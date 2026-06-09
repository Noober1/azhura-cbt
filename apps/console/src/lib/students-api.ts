/**
 * Azhura CBT Console — Admin Students API client.
 *
 * Typed wrappers over `/admin/students`. Passwords are write-only (never
 * returned). Delete is rejected (400) when the student has exam history.
 */

import api from "./api";
import type {
  StudentCreateInput,
  StudentListResponse,
  StudentSummary,
  StudentUpdateInput,
} from "../types";

export interface ListStudentsParams {
  q?: string;
  groupId?: string;
  page?: number;
  limit?: number;
}

export const studentsApi = {
  async list(params: ListStudentsParams): Promise<StudentListResponse> {
    const { data } = await api.get<StudentListResponse>("/admin/students", { params });
    return data;
  },

  async get(studentId: string): Promise<StudentSummary> {
    const { data } = await api.get<StudentSummary>(`/admin/students/${studentId}`);
    return data;
  },

  async create(input: StudentCreateInput): Promise<StudentSummary> {
    const { data } = await api.post<StudentSummary>("/admin/students", input);
    return data;
  },

  async update(studentId: string, input: StudentUpdateInput): Promise<StudentSummary> {
    const { data } = await api.patch<StudentSummary>(`/admin/students/${studentId}`, input);
    return data;
  },

  async remove(studentId: string): Promise<void> {
    await api.delete(`/admin/students/${studentId}`);
  },

  /** Collects ALL students matching filters (no pagination) for card printing (#22). */
  async fetchAll(params: Omit<ListStudentsParams, "page" | "limit">): Promise<StudentSummary[]> {
    const all: StudentSummary[] = [];
    let page = 1;
    const limit = 100;
    while (true) {
      const res = await studentsApi.list({ ...params, page, limit });
      all.push(...res.data);
      if (res.data.length === 0 || all.length >= res.meta.total) break;
      page++;
    }
    return all;
  },
};
