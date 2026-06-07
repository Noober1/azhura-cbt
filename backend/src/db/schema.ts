/**
 * Azhura CBT Backend - Drizzle ORM Schema
 *
 * Single source of truth for the database schema. `drizzle-kit` generates SQL
 * migrations from this file (`bun run db:generate`) and the migrator applies
 * them (`bun run migrate`). The previous hand-written `migrations/001_init.sql`
 * is superseded by the generated migrations.
 *
 * Column choices mirror the original schema exactly so existing data and the
 * frontend contract remain compatible:
 * - IDs are `VARCHAR(36)` (UUID-friendly) primary keys.
 * - Epoch-millisecond timestamps use `BIGINT` (matching `Date.now()`).
 * - Booleans are stored as `TINYINT(1)`.
 */

import { relations } from "drizzle-orm";
import {
  bigint,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Application users: students sit exams, supervisors/admins proctor them. */
export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  nis: varchar("nis", { length: 20 }).notNull().unique(),
  /** bcrypt hash — never the plaintext password. */
  password: varchar("password", { length: 255 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  role: mysqlEnum("role", ["student", "supervisor", "admin"])
    .notNull()
    .default("student"),
  /** Whether the account may sign in. Inactive accounts are rejected at login. */
  isActive: tinyint("is_active").notNull().default(1),
  /** The group this user belongs to; null for supervisors/admins. */
  groupId: varchar("group_id", { length: 36 }).references(() => groups.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** A named group of students (e.g. a class or cohort). */
export const groups = mysqlTable("groups", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 30 }).notNull(),
});

/** An exam definition (title + allotted duration). */
export const exams = mysqlTable("exams", {
  id: varchar("id", { length: 36 }).primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  durationMinutes: int("duration_minutes").notNull().default(30),
  isActive: tinyint("is_active").notNull().default(0),
  token: varchar("token", { length: 5 }),
  expiredAt: timestamp("expired_at").notNull().defaultNow(),
  randomizeQuestion: tinyint("randomize_question").notNull().default(1),
  randomizeAnswer: tinyint("randomize_answer").notNull().default(1),
  /** Minimum passing score (0–100). 0 = no passing grade (all pass). */
  passingGrade: tinyint("passing_grade").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Junction table for the many-to-many between exams and groups: which groups
 * are allowed to take which exam. The `(exam_id, group_id)` pair is the primary
 * key so a group can't be linked to the same exam twice, and both foreign keys
 * cascade so links clean up when an exam or group is deleted.
 */
export const examGroups = mysqlTable(
  "exam_groups",
  {
    examId: varchar("exam_id", { length: 36 })
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    groupId: varchar("group_id", { length: 36 })
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.examId, table.groupId] }),
  })
);

/**
 * Junction table for the many-to-many between exams and supervisors: which
 * supervisors are authorized to enter/edit questions for which exam. Supervisors
 * can only CRUD questions for exams listed here with their `user_id`.
 */
export const examSupervisors = mysqlTable(
  "exam_supervisors",
  {
    examId: varchar("exam_id", { length: 36 })
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.examId, table.userId] }),
  })
);

/**
 * A question belonging to an exam. `correctOptionId` is the answer key for
 * multiple_choice questions and must never be exposed to students. Non-MC types
 * store their answer/structure in `config` JSON and leave `correctOptionId` null.
 */
export const questions = mysqlTable("questions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  examId: varchar("exam_id", { length: 36 })
    .notNull()
    .references(() => exams.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  /** Answer key for multiple_choice; null for other question types. */
  correctOptionId: varchar("correct_option_id", { length: 36 }),
  orderIndex: int("order_index").notNull().default(0),
  /** Discriminates the question type and determines how `config` is interpreted. */
  type: mysqlEnum("type", ["multiple_choice", "fill_in_blank", "matching", "sorting"])
    .notNull()
    .default("multiple_choice"),
  /**
   * Type-specific data (null for multiple_choice):
   * - fill_in_blank: `{ answer: string }`
   * - matching:      `{ pairs: { left: string; right: string }[] }`
   * - sorting:       `{ items: string[]; correctOrder: number[] }`
   */
  config: json("config"),
});

/** A selectable answer option for a question. */
export const options = mysqlTable("options", {
  id: varchar("id", { length: 36 }).primaryKey(),
  questionId: varchar("question_id", { length: 36 })
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
});

/** A single student's timed attempt at an exam. */
export const examSessions = mysqlTable("exam_sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  examId: varchar("exam_id", { length: 36 })
    .notNull()
    .references(() => exams.id),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id),
  /** Epoch ms (matches frontend `Date.now()`). */
  startTime: bigint("start_time", { mode: "number" }).notNull(),
  endTime: bigint("end_time", { mode: "number" }).notNull(),
  submitted: tinyint("submitted").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Per-session persisted question order (#2 randomization). When an exam has
 * `randomize_question = 1`, the question order is shuffled once at the first
 * session start and stored here so relogin/reconnect/crash replays the same
 * order. The `(session_id, question_id)` pair is the primary key (a question
 * appears once per session); both foreign keys cascade so rows clean up when a
 * session or question is deleted. No rows are written when randomization is off
 * — the questions endpoint then falls back to `questions.order_index`.
 */
export const sessionQuestions = mysqlTable(
  "session_questions",
  {
    sessionId: varchar("session_id", { length: 36 })
      .notNull()
      .references(() => examSessions.id, { onDelete: "cascade" }),
    questionId: varchar("question_id", { length: 36 })
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    /** Position of this question within the session's shuffled order (0-based). */
    orderIndex: int("order_index").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.sessionId, table.questionId] }),
  })
);

/**
 * A student's answer to one question within a session. The
 * `(session_id, question_id)` pair is unique so answers upsert cleanly during
 * offline-first sync.
 */
export const answers = mysqlTable(
  "answers",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    sessionId: varchar("session_id", { length: 36 })
      .notNull()
      .references(() => examSessions.id),
    questionId: varchar("question_id", { length: 36 })
      .notNull()
      .references(() => questions.id),
    selectedOptionId: varchar("selected_option_id", { length: 36 }),
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    isFlagged: tinyint("is_flagged").notNull().default(0),
  },
  (table) => ({
    sessionQuestionUnique: uniqueIndex("uq_session_question").on(
      table.sessionId,
      table.questionId
    ),
  })
);

/** Anti-cheat violation log, keyed to the session it occurred in. */
export const cheatLogs = mysqlTable("cheat_logs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  sessionId: varchar("session_id", { length: 36 })
    .notNull()
    .references(() => examSessions.id),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  details: text("details"),
  occurredAt: bigint("occurred_at", { mode: "number" }).notNull(),
});

// ── Relations (enable Drizzle's relational query API) ───────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  sessions: many(examSessions),
  group: one(groups, { fields: [users.groupId], references: [groups.id] }),
  examSupervisors: many(examSupervisors),
}));

export const groupsRelations = relations(groups, ({ many }) => ({
  examGroups: many(examGroups),
  users: many(users),
}));

export const examsRelations = relations(exams, ({ many }) => ({
  questions: many(questions),
  sessions: many(examSessions),
  examGroups: many(examGroups),
  supervisors: many(examSupervisors),
}));

export const examGroupsRelations = relations(examGroups, ({ one }) => ({
  exam: one(exams, { fields: [examGroups.examId], references: [exams.id] }),
  group: one(groups, { fields: [examGroups.groupId], references: [groups.id] }),
}));

export const examSupervisorsRelations = relations(examSupervisors, ({ one }) => ({
  exam: one(exams, { fields: [examSupervisors.examId], references: [exams.id] }),
  user: one(users, { fields: [examSupervisors.userId], references: [users.id] }),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  exam: one(exams, { fields: [questions.examId], references: [exams.id] }),
  options: many(options),
}));

export const optionsRelations = relations(options, ({ one }) => ({
  question: one(questions, {
    fields: [options.questionId],
    references: [questions.id],
  }),
}));

export const examSessionsRelations = relations(examSessions, ({ one, many }) => ({
  exam: one(exams, { fields: [examSessions.examId], references: [exams.id] }),
  user: one(users, { fields: [examSessions.userId], references: [users.id] }),
  answers: many(answers),
  cheatLogs: many(cheatLogs),
  sessionQuestions: many(sessionQuestions),
}));

export const sessionQuestionsRelations = relations(sessionQuestions, ({ one }) => ({
  session: one(examSessions, {
    fields: [sessionQuestions.sessionId],
    references: [examSessions.id],
  }),
  question: one(questions, {
    fields: [sessionQuestions.questionId],
    references: [questions.id],
  }),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  session: one(examSessions, {
    fields: [answers.sessionId],
    references: [examSessions.id],
  }),
  question: one(questions, {
    fields: [answers.questionId],
    references: [questions.id],
  }),
}));

export const cheatLogsRelations = relations(cheatLogs, ({ one }) => ({
  session: one(examSessions, {
    fields: [cheatLogs.sessionId],
    references: [examSessions.id],
  }),
}));

/**
 * Global application settings stored as key/value pairs. New settings require
 * no schema migration — only a code change in the settings registry. Values are
 * always stored as text and (de)serialized per key by the registry.
 */
export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  /** Epoch-ms of the last write (matches `Date.now()` convention). */
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

/**
 * Persisted application logs for the admin log viewer (#18). Captures server
 * diagnostics (`error`/`warn`), the HTTP access trail (`access`), and semantic
 * application events (`event`: login, exam start/submit, supervisor actions).
 *
 * `fields` is the structured context, already redacted of secrets before it
 * reaches this table. `created_at` is epoch-ms (`Date.now()`), indexed so the
 * viewer can order/range-filter and the 30-day pruner can sweep efficiently.
 */
export const appLogs = mysqlTable(
  "app_logs",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    /** One of LogStream: error | warn | access | event. */
    stream: varchar("stream", { length: 10 }).notNull(),
    /** Semantic event name for the `event` stream (e.g. `login`); null otherwise. */
    eventType: varchar("event_type", { length: 40 }),
    /** Actor user id when known; null for system/anonymous entries. */
    actorId: varchar("actor_id", { length: 36 }),
    /** Actor role when known (student | supervisor | admin). */
    actorRole: varchar("actor_role", { length: 16 }),
    message: varchar("message", { length: 512 }).notNull(),
    /** Redacted structured context (no secrets). */
    fields: json("fields"),
    /** Epoch-ms of when the entry was recorded (matches `Date.now()`). */
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    index("idx_app_logs_created_at").on(t.createdAt),
    index("idx_app_logs_stream").on(t.stream),
    index("idx_app_logs_event_type").on(t.eventType),
  ]
);

/**
 * Public chat room messages (#17). Holds both student messages (`kind = user`)
 * and admin/supervisor announcements (`kind = system`, `user_id` null). The join
 * history reads the most recent rows ordered by `created_at` (indexed). `content`
 * must be stored as utf8mb4 so emoji (4-byte code points) survive — see the pool
 * `charset` in `db/index.ts`.
 */
export const chatMessages = mysqlTable(
  "chat_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    /** `user` (student message) or `system` (admin announcement). */
    kind: mysqlEnum("kind", ["user", "system"]).notNull().default("user"),
    /** Sender user id; null for system messages (and on user delete). */
    userId: varchar("user_id", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    /** Sender display name; "Pengumuman" for system messages. */
    name: varchar("name", { length: 100 }).notNull(),
    /** Sender group name; null for system messages or groupless users. */
    groupName: varchar("group_name", { length: 30 }),
    content: varchar("content", { length: 500 }).notNull(),
    /** Epoch-ms of creation (matches `Date.now()`), indexed for history/order. */
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [index("idx_chat_created_at").on(t.createdAt)]
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  user: one(users, { fields: [chatMessages.userId], references: [users.id] }),
}));

/** Convenience row types inferred from the schema. */
export type User = typeof users.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Exam = typeof exams.$inferSelect;
export type ExamGroup = typeof examGroups.$inferSelect;
export type ExamSupervisor = typeof examSupervisors.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Option = typeof options.$inferSelect;
export type ExamSession = typeof examSessions.$inferSelect;
export type SessionQuestion = typeof sessionQuestions.$inferSelect;
export type Answer = typeof answers.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type AppLog = typeof appLogs.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
