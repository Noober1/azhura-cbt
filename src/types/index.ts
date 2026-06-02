/**
 * Tauri CBT App - Core Type Definitions
 * Represents the baseline data models for user authentication, exam session,
 * questions, answers, and anti-cheat tracking.
 */

export interface User {
  id: string;
  nis: string;
  name: string;
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
}

export interface ExamResult {
  score: number;
  totalCorrect: number;
  totalWrong: number;
  totalEmpty: number;
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

export interface AntiCheatEvent {
  id: string;
  eventType: 'focus_loss' | 'fullscreen_exit' | 'shortcut_attempt' | 'multi_monitor';
  timestamp: number;
  details?: string;
}
