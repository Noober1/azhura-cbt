/**
 * Azhura CBT - Core Type Definitions (shared)
 *
 * Single source of truth for domain models shared across the student client
 * (`apps/student`), the admin/supervisor console (`apps/console`), and aligned
 * with the backend (`backend/src/db/schema.ts`). Keep this in sync with the API
 * contract so the two frontends never drift.
 */

export interface User {
  id: string;
  nis: string;
  name: string;
  /**
   * Display name of the student's group/class (e.g. "Kelas 7A"). Null for users
   * without a group (supervisors/admins) and absent on sessions cached before
   * this field existed — render a fallback when missing.
   */
  groupName?: string | null;
}

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  text: string;
  options: QuestionOption[];
  correctAnswerId?: string; // Stored securely on the server
}

export interface ExamAnswer {
  questionId: string;
  selectedOptionId: string | null;
  timestamp: number;
  isFlagged: boolean;
}

export interface ExamSession {
  id: string;
  examId: string;
  userId: string;
  startTime: number;
  endTime: number;
  totalQuestions: number;
  examTitle: string;
}

/**
 * A summary of an exam the student is eligible to take, as listed on the
 * dashboard. Returned by `GET /exams`. Does not include any question content.
 */
export interface AvailableExam {
  id: string;
  /** Subject / exam display name, e.g. "Ujian Akhir Semester - Matematika". */
  title: string;
  totalQuestions: number;
  /** Total working time, in minutes. */
  durationMinutes: number;
  /**
   * True when the caller has already submitted this exam. Completed exams stay
   * in the list but cannot be retaken — the dashboard disables their start
   * action and the server rejects a new session with 409. Always false for
   * non-students (supervisors/admins do not take exams).
   */
  completed: boolean;
  /**
   * True when this exam is gated by an access token: the student must enter a
   * matching token before a session can be created. The token value itself is
   * never sent to the client — only this flag — and verification is server-side.
   */
  requiresToken: boolean;
}

export interface ExamResult {
  score: number;
  totalCorrect: number;
  totalWrong: number;
  totalEmpty: number;
}

/**
 * Response of `GET /api/exams/sessions/active` (#4 resume-session). A discriminated
 * union telling the client where to route a returning student:
 * - `none`      — no in-progress session; proceed to the dashboard.
 * - `resume`    — an unsubmitted session with time remaining; go to the exam.
 * - `finalized` — an unsubmitted session whose time expired; it was scored
 *                 server-side, so show the result.
 */
export type ActiveSessionResponse =
  | { status: "none" }
  | { status: "resume"; session: ExamSession }
  | { status: "finalized"; examTitle: string; result: ExamResult };

export interface ConnectivityState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingAnswers: ExamAnswer[];
}

export interface SocketMessage {
  type: string;
  payload: any;
  timestamp: number;
}

export interface AntiCheatConfig {
  enabled: boolean;
  fullscreen: boolean;
  blockShortcuts: boolean;
  detectFocusLoss: boolean;
  detectMultiMonitor: boolean;
}

export interface AntiCheatEvent {
  id: string;
  eventType: 'focus_loss' | 'fullscreen_exit' | 'shortcut_attempt' | 'multi_monitor';
  timestamp: number;
  details?: string;
}
