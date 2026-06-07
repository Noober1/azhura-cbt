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
  /**
   * Students currently mid-exam (active, unsubmitted session) from this group.
   * When > 0 the group is "locked" — it cannot be removed from the exam's
   * allowed groups (#29). Present on exam detail responses.
   */
  activeParticipants: number;
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
  passingGrade: number;
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
  passingGrade: number;
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
  passingGrade?: number;
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

// ── Groups (#15) ────────────────────────────────────────────────────────────

/** Row from `GET /admin/groups` (and the shape returned by create/update). */
export interface GroupSummary {
  id: string;
  name: string;
  memberCount: number;
}

export interface GroupListResponse {
  data: GroupSummary[];
  meta: { total: number; page: number; limit: number };
}

export interface GroupCreateInput {
  name: string;
}

export type GroupUpdateInput = { name: string };

// ── Students (#15) ──────────────────────────────────────────────────────────

/** Row from `GET /admin/students` (and the shape returned by get/create/update). */
export interface StudentSummary {
  id: string;
  nis: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  isActive: boolean;
  createdAt: number;
}

export interface StudentListResponse {
  data: StudentSummary[];
  meta: { total: number; page: number; limit: number };
}

export interface StudentCreateInput {
  nis: string;
  name: string;
  password: string;
  groupId?: string | null;
  isActive?: boolean;
}

/** Body for `PATCH /admin/students/:studentId` (all optional). */
export interface StudentUpdateInput {
  nis?: string;
  name?: string;
  password?: string;
  groupId?: string | null;
  isActive?: boolean;
}

// ── Settings (#16) ──────────────────────────────────────────────────────────

export type { SystemSettings } from "@azhura/shared";

/** Body for `PATCH /admin/settings` — all fields are optional. */
export type SystemSettingsInput = Partial<import("@azhura/shared").SystemSettings>;

// ── Sessions (#45) ──────────────────────────────────────────────────────────

export type SessionStatus = "in_progress" | "completed" | "expired";

/** Row from `GET /admin/exams/:examId/sessions`. */
export interface ExamSessionRow {
  id: string;
  userId: string;
  name: string;
  nis: string;
  groupName: string | null;
  startTime: number;
  endTime: number;
  status: SessionStatus;
}

// ── Aggregate recap (#19) ─────────────────────────────────────────────────────

// Defined once in @azhura/shared so the backend contract and console stay aligned.
export type {
  RecapSessionStatus,
  RecapParticipant,
  ExamRecapStats,
  ExamRecapQuery,
  ExamRecapResponse,
  StudentRecapEntry,
  StudentRecapStats,
  StudentRecapQuery,
  StudentRecapResponse,
} from "@azhura/shared";
