/**
 * Azhura CBT Console — Supervisor question management API client (#88).
 *
 * Wraps the `/supervisor/exams*` endpoints implemented in backend
 * `supervisor-questions.ts`. Only the calling supervisor's assigned exams are
 * accessible; attempting to touch an unassigned exam returns 403.
 */

import api from "./api";
import type { AdminQuestion, AssignedExam } from "../types";

export interface SupervisorQuestionInput {
  text: string;
  orderIndex?: number;
  options: { text: string }[];
  correctOptionIndex: number;
}

export const supervisorQuestionsApi = {
  async listExams(): Promise<AssignedExam[]> {
    const { data } = await api.get<AssignedExam[]>("/supervisor/exams");
    return data;
  },

  async listQuestions(examId: string): Promise<AdminQuestion[]> {
    const { data } = await api.get<AdminQuestion[]>(
      `/supervisor/exams/${examId}/questions`
    );
    return data;
  },

  async createQuestion(
    examId: string,
    input: SupervisorQuestionInput
  ): Promise<AdminQuestion> {
    const { data } = await api.post<AdminQuestion>(
      `/supervisor/exams/${examId}/questions`,
      input
    );
    return data;
  },

  async updateQuestion(
    examId: string,
    questionId: string,
    input: SupervisorQuestionInput
  ): Promise<AdminQuestion> {
    const { data } = await api.put<AdminQuestion>(
      `/supervisor/exams/${examId}/questions/${questionId}`,
      input
    );
    return data;
  },

  async deleteQuestion(examId: string, questionId: string): Promise<void> {
    await api.delete(`/supervisor/exams/${examId}/questions/${questionId}`);
  },
};
