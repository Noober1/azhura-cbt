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
  /**
   * Batch numbers (1–10) allowed to access this exam. Empty means open to all
   * batches. Mirrors the `exam_batches` restriction (#76).
   */
  batches: number[];
}

export interface ExamListResponse {
  data: ExamSummary[];
  meta: { total: number; page: number; limit: number };
}

export interface AdminOption {
  id: string;
  text: string;
  /**
   * Optional option image (#163): a media-library URL path (`/uploads/...`).
   * Resolve against the backend origin (`resolveMediaUrl`) before rendering.
   * Null when the option is text-only.
   */
  imageUrl: string | null;
}

export interface AdminQuestion {
  id: string;
  text: string;
  type: import("@azhura/shared").QuestionType;
  config: import("@azhura/shared").QuestionConfig | null;
  orderIndex: number;
  correctOptionId: string | null;
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
  /**
   * Batch numbers (1–10) allowed to access this exam. Empty means open to all
   * batches (#76).
   */
  batches: number[];
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
  /**
   * Batch numbers (1–10) allowed to access this exam. Omit or pass an empty
   * array to allow all batches (#76).
   */
  batches?: number[];
}

/** Body for `PATCH /admin/exams/:examId` (all optional). */
export type ExamUpdateInput = Partial<ExamCreateInput>;

/** Body for `POST /admin/exams/:examId/questions`. */
export interface QuestionCreateInput {
  text: string;
  orderIndex?: number;
  type?: import("@azhura/shared").QuestionType;
  /** Required when type is not multiple_choice. */
  config?: import("@azhura/shared").QuestionConfig;
  /** Required when type is multiple_choice or omitted. */
  options?: { text: string; imageUrl?: string | null }[];
  correctOptionIndex?: number;
}

/** Body for `PATCH /admin/exams/:examId/questions/:qid`. */
export interface QuestionUpdateInput {
  text?: string;
  orderIndex?: number;
  type?: import("@azhura/shared").QuestionType;
  config?: import("@azhura/shared").QuestionConfig;
  options?: { text: string; imageUrl?: string | null }[];
  correctOptionIndex?: number;
}

// ── Groups (#15) ────────────────────────────────────────────────────────────

/** Row from `GET /admin/groups` (and the shape returned by create/update). */
export interface GroupSummary {
  id: string;
  name: string;
  /** Short unique code (e.g. "7A"). */
  code: string;
  memberCount: number;
}

export interface GroupListResponse {
  data: GroupSummary[];
  meta: { total: number; page: number; limit: number };
}

export interface GroupCreateInput {
  name: string;
  /** Short unique code (1–6 chars, stored uppercase). */
  code: string;
}

export type GroupUpdateInput = { name?: string; code?: string };

// ── Students (#15) ──────────────────────────────────────────────────────────

/** Row from `GET /admin/students` (and the shape returned by get/create/update). */
export interface StudentSummary {
  id: string;
  nis: string;
  name: string;
  /** Plaintext password stored at creation/update time — for admin card printing only. */
  initialPassword: string | null;
  groupId: string | null;
  groupName: string | null;
  batch: number;
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
  batch?: number;
  isActive?: boolean;
}

/** Body for `PATCH /admin/students/:studentId` (all optional). */
export interface StudentUpdateInput {
  nis?: string;
  name?: string;
  password?: string;
  groupId?: string | null;
  batch?: number;
  isActive?: boolean;
}

// ── Settings (#16) ──────────────────────────────────────────────────────────

export type { SystemSettings } from "@azhura/shared";

/** Body for `PATCH /admin/settings` — all fields are optional. */
export type SystemSettingsInput = Partial<import("@azhura/shared").SystemSettings>;

// ── Supervisor accounts & assignment (#86, #139, #140) ───────────────────────

// Defined once in @azhura/shared so the backend CRUD contract, the management
// page (#140), and the assignment picker all share one shape.
export type {
  SupervisorAccount,
  CreateSupervisorRequest,
  UpdateSupervisorRequest,
} from "@azhura/shared";

export interface ExamSupervisorDetail {
  examId: string;
  userId: string;
  name: string;
  nis: string;
}

/** Row from `GET /supervisor/exams` — exams assigned to the calling supervisor. */
export interface AssignedExam {
  id: string;
  title: string;
  durationMinutes: number;
  isActive: boolean;
  passingGrade: number;
  createdAt: number;
}

// ── Media (#84) ─────────────────────────────────────────────────────────────

export type { MediaFile, MediaType } from "@azhura/shared";

export interface MediaListResponse {
  data: import("@azhura/shared").MediaFile[];
  meta: { total: number; page: number; limit: number };
}

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
  DashboardSnapshot,
  ExamScoreSummary,
} from "@azhura/shared";

// ── Spreadsheet Import (#70, #72) ─────────────────────────────────────────────

export interface GroupImportRowResult {
  row: number;
  code: string;
  name: string;
  status: "valid" | "error";
  error?: string;
}

export interface GroupImportPreview {
  sessionId: string;
  total: number;
  validCount: number;
  rows: GroupImportRowResult[];
}

export interface GroupImportConfirmResult {
  inserted: number;
  updated: number;
}

export interface StudentImportRowResult {
  row: number;
  nis: string;
  nama: string;
  grup: string;
  /** Exam batch (1–10). Defaults to 1 when the import cell is empty. */
  batch?: number;
  /** True when this NIS already exists (update path). */
  isUpdate?: boolean;
  status: "valid" | "error";
  error?: string;
}

export interface StudentImportPreview {
  sessionId: string;
  mode: "import" | "sync";
  total: number;
  validCount: number;
  insertCount: number;
  updateCount: number;
  /** Mode Sync only — number of students that will be deleted. */
  toDelete?: number;
  /** Mode Sync only — students skipped from deletion (have exam history). */
  skippedDelete?: number;
  rows: StudentImportRowResult[];
}

export interface StudentImportConfirmResult {
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
}

// ── Exam Import (#82) ─────────────────────────────────────────────────────────

export interface ExamImportRowResult {
  row: number;
  status: "ready" | "skip" | "error";
  judul?: string;
  durasi_menit?: number;
  passing_grade?: number;
  token?: string;
  expired_at?: string;
  reason?: string;
}

export interface ExamImportPreview {
  sessionToken: string;
  summary: { ready: number; skip: number; error: number };
  rows: ExamImportRowResult[];
}

export interface ExamImportConfirmResult {
  inserted: number;
  skipped: number;
}

