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
  /**
   * Sub-batch within the student's group for staggered exam access (1–10).
   * Absent for non-student users. Default 1.
   */
  batch?: number;
}

export interface QuestionOption {
  id: string;
  text: string;
}

// ── Question types (#90) ──────────────────────────────────────────────────────

export type QuestionType = 'multiple_choice' | 'fill_in_blank' | 'matching' | 'sorting';

export interface FillInBlankConfig {
  /** Primary correct answer (legacy field — always present for backward compat). */
  answer: string;
  /** Additional valid answers. When non-empty, any match in this list also counts as correct. */
  answers?: string[];
}

export interface MatchingConfig {
  pairs: { left: string; right: string }[];
}

export interface SortingConfig {
  items: string[];
  correctOrder: number[];
}

export type QuestionConfig = FillInBlankConfig | MatchingConfig | SortingConfig;

export interface Question {
  id: string;
  text: string;
  /** Discriminates the question type. Defaults to `multiple_choice` for legacy questions. */
  type: QuestionType;
  /** Options list — only present for `multiple_choice` questions. */
  options: QuestionOption[];
  /**
   * Type-specific answer/structure data. `null` for `multiple_choice` (uses `options` instead).
   * Contains the answer key for non-MC types — **must be stripped before sending to students**.
   */
  config: QuestionConfig | null;
  correctAnswerId?: string; // Stored securely on the server
}

export interface ExamAnswer {
  questionId: string;
  selectedOptionId: string | null;
  /** JSON-serialized answer for non-MC types; null for multiple_choice. */
  answerValue?: string | null;
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
  /** Minimum passing score (0–100). 0 means no passing grade (all pass). */
  passingGrade: number;
  /**
   * Batch numbers allowed to access this exam (admin-facing). Empty or absent
   * means the exam is open to all batches in the allowed groups.
   */
  batches?: number[];
}

export interface ExamResult {
  score: number;
  totalCorrect: number;
  totalWrong: number;
  totalEmpty: number;
  /** Minimum passing score from the exam (0–100). 0 = no passing grade. */
  passingGrade: number;
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
  /**
   * Set (ms epoch) when the student disconnected mid-exam; null while running.
   * Remaining time = endTime − pausedAt. Console freezes the countdown when set.
   */
  pausedAt: number | null;
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
  /** Short unique code (e.g. "7A"). */
  code: string;
}

// ── Supervisor–exam assignment (#83) ─────────────────────────────────────────

/** A row in `exam_supervisors`: a supervisor authorized to edit questions for an exam. */
export interface ExamSupervisor {
  examId: string;
  userId: string;
}

/** Extended view returned by the list endpoint: includes supervisor display info. */
export interface ExamSupervisorDetail extends ExamSupervisor {
  name: string;
  nis: string;
}

/**
 * Read-only exam context shown to a supervisor on the question-management page
 * (`GET /supervisor/exams/:examId`, #141). It mirrors the admin exam-detail card
 * (title, duration, passing grade, status, expiry, allowed groups, question
 * count) but is deliberately stripped of admin-only data — most importantly the
 * access `token` is NEVER included, since supervisors must not see it.
 */
export interface SupervisorExamDetail {
  id: string;
  title: string;
  /** Total working time, in minutes. */
  durationMinutes: number;
  /** Whether the exam is currently active (open to students). */
  isActive: boolean;
  /** Exam expiry, epoch milliseconds. */
  expiredAt: number;
  /** Minimum passing score (0–100). 0 = no passing grade (all pass). */
  passingGrade: number;
  /** Display names of the groups allowed to take this exam (e.g. "Kelas 7A"). */
  allowedGroupNames: string[];
  /** Number of questions currently in the exam. */
  questionCount: number;
/** A supervisor user account as returned by the admin supervisor CRUD routes (#139). Never includes the password hash. */
export interface SupervisorAccount {
  id: string;
  nis: string;
  name: string;
  isActive: boolean;
  /** Plaintext initial/last-reset password kept for credential distribution; null for older accounts. */
  initialPassword: string | null;
  createdAt: number;
}

/** Request body for creating a supervisor account. */
export interface CreateSupervisorRequest {
  nis: string;
  name: string;
  password: string;
}

/** Request body for a partial supervisor profile update (password has its own route). */
export interface UpdateSupervisorRequest {
  nis?: string;
  name?: string;
  isActive?: boolean;
}

// ── Public chat room (#17) ───────────────────────────────────────────────────

/**
 * Kind of a chat message:
 * - `user`   — a student's message.
 * - `system` — an admin/supervisor announcement (rendered distinctly).
 */
export type ChatMessageKind = "user" | "system";

/**
 * One message in the public chat room (#17). `userId`/`groupName` are null for
 * `system` announcements. `content` is already sanitized + length-capped server
 * side; clients still render it as text (React escapes) — never as HTML.
 */
export interface ChatMessage {
  id: string;
  kind: ChatMessageKind;
  /** Sender user id; null for system/announcement messages. */
  userId: string | null;
  /** Sender display name; "Pengumuman" for system messages. */
  name: string;
  /** Sender group name; null for system messages or users without a group. */
  groupName: string | null;
  content: string;
  /** Epoch milliseconds when the message was created. */
  timestamp: number;
}

/** Payload of the `chat:history` socket event: the last N messages, oldest→newest. */
export interface ChatHistoryEvent {
  messages: ChatMessage[];
}

/** A member currently present in the chat room — used as an @mention candidate. */
export interface ChatPresenceMember {
  userId: string;
  name: string;
  groupName: string | null;
}

/** Payload of the `chat:presence` socket event: everyone currently in the room. */
export interface ChatPresenceEvent {
  members: ChatPresenceMember[];
}

/**
 * Payload of the `chat:muted` socket event sent to a muted sender (#17).
 * `manual` distinguishes a supervisor/admin mute from the anti-spam auto-mute,
 * so the client can phrase the notice accordingly.
 */
export interface ChatMutedEvent {
  /** Epoch ms the mute lifts; for an indefinite supervisor mute this is far in the future. */
  mutedUntil: number;
  reason: string;
  manual: boolean;
}

/** Payload of the `chat:unmuted` socket event: a previously-muted user was freed. */
export interface ChatUnmutedEvent {
  userId: string;
}

/** Payload of the `chat:error` socket event: a send was rejected (validation feedback). */
export interface ChatErrorEvent {
  reason: string;
}

/**
 * Payload of the `chat:config` socket event (#17): whether the chat feature is
 * globally enabled. Pushed on connect and whenever an admin toggles the setting,
 * so clients show/hide the chat surface live.
 */
export interface ChatConfigEvent {
  enabled: boolean;
}

/**
 * A muted user as listed for console moderation (`GET /supervisor/chat/mutes`).
 * `mutedUntil` is null for an indefinite mute (lifts only on explicit unmute).
 */
export interface MutedUser {
  userId: string;
  name: string;
  mutedUntil: number | null;
  /** User id of the supervisor/admin who applied the mute. */
  by: string;
  reason: string;
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
  /** L3 (#27): swallow OS shortcuts (Alt+Tab/Win/…) via a low-level keyboard
   *  hook. Windows desktop only — a no-op on other OSes and on the web. */
  blockOsKeyboard: boolean;
}

/** Public school/app info returned by GET /api/info (no auth required). */
export interface SchoolInfo {
  schoolName: string;
  address: string;
  appVersion: string;
}

/**
 * First-run provisioning status from `GET /api/setup/status` (no auth required).
 * `needsSetup` is true while the system has no admin account — the console then
 * shows the setup wizard instead of the login page. It flips to false for good
 * once the first admin is created via `POST /api/setup`.
 */
export interface SetupStatus {
  needsSetup: boolean;
}

/**
 * Body of `POST /api/setup` — creates the first admin and records school info on
 * a fresh install. Rejected with 409 once any admin already exists (self-locks).
 */
export interface SetupRequest {
  /** Display name of the school (stored in system settings). */
  schoolName: string;
  /** Optional street/address line of the school. */
  schoolAddress?: string;
  /** Full name of the first administrator account. */
  adminName: string;
  /** Login NIS/username for the admin (min 5 chars, must be unique). */
  adminNis: string;
  /** Plaintext password for the admin (min 6 chars); hashed server-side. */
  adminPassword: string;
  /**
   * Enable the public student chat room from the outset. Optional — when omitted
   * the global default (chat off) applies and it can be toggled later in admin
   * settings.
   */
  chatEnabled?: boolean;
}

/** Success payload from `POST /api/setup`. */
export interface SetupResult {
  success: true;
}

/** Per-exam score statistics for the admin dashboard chart. */
export interface ExamScoreSummary {
  examId: string;
  examTitle: string;
  min: number;
  median: number;
  max: number;
  totalSubmissions: number;
}

/** Realtime stats snapshot for the admin dashboard (#78). */
export interface DashboardSnapshot {
  welcome: { name: string };
  stats: {
    totalStudents: number;
    totalGroups: number;
    totalExams: number;
    /** Students whose socket is currently connected (status = "connected" in session registry). */
    onlineStudents: number;
    sessions: {
      completed:  { count: number; percentage: number };
      inProgress: { count: number; percentage: number };
      notStarted: { count: number; percentage: number };
    };
  };
  /** Exams with at least one submitted session. */
  examScores: ExamScoreSummary[];
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
    | 'window_close_blocked'
    | 'os_shortcut_blocked';
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
  /** When true, the public student chat room (#17) is available on the dashboard. */
  chatEnabled: boolean;
}

// ── Application logs (#18) ───────────────────────────────────────────────────

/**
 * Which stream/category a persisted log entry belongs to (#18).
 * - `error`/`warn` — server diagnostics promoted from the structured logger.
 * - `access`       — one entry per HTTP request (method/path/status).
 * - `event`        — a semantic application event (login, exam start/submit,
 *                    supervisor action) with an `eventType` discriminator.
 */
export type LogStream = 'error' | 'warn' | 'access' | 'event';

/**
 * The realtime-broadcast shape of a log entry (`log-entry` socket event). It is
 * the persisted {@link LogEntry} minus the DB-assigned `id`, so the live tail
 * and the HTTP history share one rendering path in the admin viewer.
 */
export interface LogBroadcast {
  stream: LogStream;
  /** Semantic event name for the `event` stream (e.g. `login`); null otherwise. */
  eventType: string | null;
  /** Actor user id when known; null for system/anonymous entries. */
  actorId: string | null;
  /** Actor role when known (`student` | `supervisor` | `admin`). */
  actorRole: string | null;
  message: string;
  /** Structured context, already redacted of secrets (password/token/answers). */
  fields: Record<string, unknown> | null;
  /** Epoch milliseconds when the entry was recorded. */
  timestamp: number;
}

/** A persisted application log entry surfaced to the admin log viewer (#18). */
export interface LogEntry extends LogBroadcast {
  /** DB-assigned, monotonically increasing identifier. */
  id: number;
}

/** Query/filter accepted by `GET /admin/logs` (#18). All fields optional. */
export interface LogQuery {
  stream?: LogStream;
  eventType?: string;
  actorId?: string;
  /** Inclusive lower time bound (epoch ms). */
  from?: number;
  /** Inclusive upper time bound (epoch ms). */
  to?: number;
  /** 1-based page number (default 1). */
  page?: number;
  /** Page size (default 50, capped server-side). */
  limit?: number;
}

/** Paginated result returned by `GET /admin/logs` (#18). */
export interface LogPage {
  rows: LogEntry[];
  total: number;
  page: number;
  limit: number;
}

// ── Aggregate recap (#19) ─────────────────────────────────────────────────────

/**
 * Lifecycle of a graded exam session, as derived server-side from the
 * `submitted` flag and `end_time` vs the current clock. Mirrors the admin
 * sessions list; only `completed`/`expired` sessions carry a final score.
 */
export type RecapSessionStatus = "in_progress" | "completed" | "expired";

/**
 * One participant row in a per-exam recap (`GET /admin/recap/exams/:examId`).
 * `score` is the rounded percentage (0–100) and is `null` while the session is
 * still `in_progress` (no final grade yet). `totalCorrect + totalWrong +
 * totalEmpty` always equals the exam's question count for graded sessions.
 */
export interface RecapParticipant {
  sessionId: string;
  userId: string;
  name: string;
  nis: string;
  groupName: string | null;
  status: RecapSessionStatus;
  /** Rounded percentage 0–100, or null while in progress. */
  score: number | null;
  totalCorrect: number;
  totalWrong: number;
  totalEmpty: number;
  startTime: number;
  endTime: number;
}

/** Aggregate statistics over the filtered set of a per-exam recap. */
export interface ExamRecapStats {
  /** Participants matching the filters (all statuses). */
  totalParticipants: number;
  /** How many of them have a final score (completed/expired). */
  completedCount: number;
  /** Mean score across graded sessions, or null when none are graded. */
  average: number | null;
  highest: number | null;
  lowest: number | null;
}

/** Query/filter accepted by `GET /admin/recap/exams/:examId`. All optional. */
export interface ExamRecapQuery {
  /** Restrict to participants in this group. */
  groupId?: string;
  /** Inclusive session-start lower/upper bounds (epoch ms). */
  from?: number;
  to?: number;
  page?: number;
  limit?: number;
}

/** Response of `GET /admin/recap/exams/:examId` (#19). */
export interface ExamRecapResponse {
  exam: { id: string; title: string; totalQuestions: number };
  stats: ExamRecapStats;
  participants: RecapParticipant[];
  total: number;
  page: number;
  limit: number;
}

/** One exam in a student's cross-exam history (`GET /admin/recap/students/:id`). */
export interface StudentRecapEntry {
  sessionId: string;
  examId: string;
  examTitle: string;
  status: RecapSessionStatus;
  /** Rounded percentage 0–100, or null while in progress. */
  score: number | null;
  totalCorrect: number;
  totalWrong: number;
  totalEmpty: number;
  startTime: number;
  endTime: number;
}

/** Aggregate statistics over a student's filtered exam history. */
export interface StudentRecapStats {
  examsTaken: number;
  completedCount: number;
  average: number | null;
}

/** Query/filter accepted by `GET /admin/recap/students/:studentId`. All optional. */
export interface StudentRecapQuery {
  /** Restrict history to a single exam. */
  examId?: string;
  from?: number;
  to?: number;
  page?: number;
  limit?: number;
}

/** Response of `GET /admin/recap/students/:studentId` (#19). */
export interface StudentRecapResponse {
  student: { id: string; name: string; nis: string; groupName: string | null };
  stats: StudentRecapStats;
  history: StudentRecapEntry[];
  total: number;
  page: number;
  limit: number;
}


export type MediaType = "image" | "audio" | "video";

/** A media file record as returned by `GET /admin/media` and `POST /admin/media`. */
export interface MediaFile {
  id: string;
  filename: string;
  originalName: string;
  type: MediaType;
  mimeType: string;
  sizeBytes: number;
  url: string;
  uploadedBy: string | null;
  createdAt: number;
}
