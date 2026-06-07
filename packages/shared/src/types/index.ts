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
 *
 * The `resume` branch carries `serverTime` (server clock at response) so the
 * client can capture clock skew and keep its offline-tolerant countdown aligned
 * with the authoritative `endTime` (#8).
 */
export type ActiveSessionResponse =
  | { status: "none" }
  | { status: "resume"; session: ExamSession; serverTime: number }
  | { status: "finalized"; examTitle: string; result: ExamResult };

/**
 * Payload of the `time-change` Socket.io event pushed to a student (#8). Emitted
 * when a supervisor adds/subtracts that student's remaining time. `endTime` is the
 * new authoritative session end (ms epoch); `serverTime` is the server clock at
 * emit so the client can re-derive its clock-skew offset before applying it.
 */
export interface TimeChangeEvent {
  endTime: number;
  serverTime: number;
}

/**
 * Live connection state of a participant on the supervisor roster (#7).
 * - `connected`    — session has a live WebSocket attached.
 * - `disconnected` — no active session entry (socket gone / expired).
 * - `pending`      — session claimed at login but the WebSocket has not
 *                    attached yet (brief window before the exam socket connects).
 */
export type RosterConnection = "connected" | "disconnected" | "pending";

/** The exam a roster participant is actively working on. */
export interface RosterExam {
  examId: string;
  examTitle: string;
  /** Session start, ms epoch. */
  startTime: number;
  /** Session end, ms epoch. The console derives the live countdown from this. */
  endTime: number;
}

/**
 * One row of the live participant roster shown to supervisors/admins (#7).
 *
 * The roster spans every logged-in student: those mid-exam (sourced from active
 * `exam_sessions`) and those idle on the dashboard (sourced from the Redis
 * session registry). `exam` is null for dashboard students — the console groups
 * them under a "Dashboard" section so a supervisor can remote-logout anyone who
 * forgot to sign out. `connection`/`lastSeen` are overlaid from the registry.
 */
export interface RosterParticipant {
  userId: string;
  nis: string;
  name: string;
  groupName: string | null;
  /** Exam being worked on; null means the student is idle on the dashboard. */
  exam: RosterExam | null;
  connection: RosterConnection;
  /** Last liveness timestamp (ms epoch); null when no active registry entry. */
  lastSeen: number | null;
}

/**
 * Initial roster snapshot returned by `GET /api/supervisor/roster` (backfill).
 * The console fetches this once, then stays live via the `roster-update` event.
 */
export interface RosterSnapshot {
  participants: RosterParticipant[];
  /** Server clock at snapshot time (ms epoch) for client-side skew correction. */
  serverTime: number;
}

/**
 * Incremental roster change pushed over the `roster-update` Socket.io event to
 * the `supervisors` room. Patches avoid resending the full roster on every change.
 * - `upsert`     — a participant started (or is refreshed) in the roster.
 * - `remove`     — a participant left the roster (submitted / expired / kicked).
 * - `connection` — a participant's liveness changed (connect/disconnect).
 */
export type RosterPatch =
  | { type: "upsert"; participant: RosterParticipant }
  | { type: "remove"; userId: string }
  | {
      type: "connection";
      userId: string;
      connection: RosterConnection;
      lastSeen: number;
    };

/**
 * How a supervisor broadcast (#13) is displayed on the student client:
 * - `toast`  — a non-intrusive notification (default).
 * - `modal`  — a lightly-blocking dialog the student must acknowledge.
 */
export type SupervisorMessageVariant = "toast" | "modal";

/** Payload of the `alert-message` Socket.io event pushed to students (#13). */
export interface SupervisorMessage {
  message: string;
  variant: SupervisorMessageVariant;
}

/**
 * Who a supervisor broadcast targets (#13). Resolved server-side to socket rooms:
 * `all` → every student, `user` → `user:{id}`, `group` → each `group:{id}`.
 */
export type BroadcastTarget =
  | { type: "all" }
  | { type: "user"; userId: string }
  | { type: "group"; groupIds: string[] };

/** A group option for the broadcast target picker (`GET /supervisor/groups`). */
export interface GroupOption {
  id: string;
  name: string;
}

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

/** Public school/app info returned by GET /api/info (no auth required). */
export interface SchoolInfo {
  schoolName: string;
  address: string;
  appVersion: string;
}

export interface AntiCheatEvent {
  id: string;
  eventType:
    | 'focus_loss'
    | 'fullscreen_exit'
    | 'shortcut_attempt'
    | 'multi_monitor'
    | 'clipboard_blocked'
    | 'force_refocus'
    | 'window_close_blocked';
  timestamp: number;
  details?: string;
}

/**
 * Global admin-editable application settings. Returned by `GET /admin/settings`
 * and accepted (partially) by `PATCH /admin/settings`. The backend registry
 * (`settings-registry.ts`) applies defaults for any key absent from the DB.
 */
export interface SystemSettings {
  schoolName: string;
  schoolAddress: string;
  /** Default duration offered in the "new exam" form, in minutes (1–480). */
  defaultExamDurationMinutes: number;
  /** Default passing score offered in the "new exam" form (0–100). */
  defaultPassingGrade: number;
  /** When true, the anti-cheat engine is active for all student sessions. */
  antiCheatEnabled: boolean;
}
