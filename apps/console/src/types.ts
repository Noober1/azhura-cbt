/**
 * Azhura CBT Console — Admin API response/request shapes.
 *
 * These mirror the admin routes in `backend/src/routes/admin/{exams,questions}.ts`.
 * Unlike the student-facing `@azhura/shared` models, admin views DO include the
 * answer key (`correctOptionId`) and the exam `token` — they are management data.
 * Timestamps are epoch-millis numbers as the backend serializes them.
 */

export interface AdminGroupRef {
  id: string;
  name: string;
}

/** Row shape from `GET /admin/exams` (list, with counts). */
export interface ExamSummary {
  id: string;
  title: string;
  durationMinutes: number;
  isActive: boolean;
  token: string | null;
  expiredAt: number;
  randomizeQuestion: boolean;
  randomizeAnswer: boolean;
  createdAt: number;
  totalQuestions: number;
  totalGroups: number;
}

export interface ExamListResponse {
  data: ExamSummary[];
  meta: { total: number; page: number; limit: number };
}

export interface AdminOption {
  id: string;
  text: string;
}

export interface AdminQuestion {
  id: string;
  text: string;
  orderIndex: number;
  correctOptionId: string;
  options: AdminOption[];
}

/** Full detail from `GET /admin/exams/:examId`. */
export interface ExamDetail {
  id: string;
  title: string;
  durationMinutes: number;
  isActive: boolean;
  token: string | null;
  expiredAt: number;
  randomizeQuestion: boolean;
  randomizeAnswer: boolean;
  createdAt: number;
  allowedGroups: AdminGroupRef[];
  questions: AdminQuestion[];
}

/** Body for `POST /admin/exams`. */
export interface ExamCreateInput {
  title: string;
  durationMinutes: number;
  expiredAt: number;
  isActive?: boolean;
  token?: string | null;
  randomizeQuestion?: boolean;
  randomizeAnswer?: boolean;
  allowedGroups?: string[];
}

/** Body for `PATCH /admin/exams/:examId` (all optional). */
export type ExamUpdateInput = Partial<ExamCreateInput>;

/** Body for `POST /admin/exams/:examId/questions`. */
export interface QuestionCreateInput {
  text: string;
  orderIndex?: number;
  options: { text: string }[];
  correctOptionIndex: number;
}

/** Body for `PATCH /admin/exams/:examId/questions/:qid`. */
export interface QuestionUpdateInput {
  text?: string;
  orderIndex?: number;
  options?: { text: string }[];
  correctOptionIndex?: number;
}
