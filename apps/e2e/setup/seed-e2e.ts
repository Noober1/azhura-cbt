/**
 * Idempotent E2E seed — creates grp_e2e, two e2e students, and two exams
 * (open + token-gated) with 3 questions each using direct DB access.
 *
 * Uses INSERT ... ON DUPLICATE KEY UPDATE so re-runs are always safe.
 * Requires DB_* env vars to be set (see apps/e2e/.env.example).
 */

import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { E2E_ADMIN, E2E_EXAM, E2E_EXAM_TOKEN, E2E_GROUP, E2E_RECAP, E2E_STUDENT, E2E_STUDENT_ALT, E2E_SUPERVISOR } from "../data/users.ts";

function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "azhura_cbt",
  });
}

const EXAM_QUESTIONS = [
  {
    id: "q_e2e_1",
    text: "E2E Soal 1: Manakah ibukota Indonesia?",
    options: [
      { id: "opt_e2e_1a", text: "Surabaya" },
      { id: "opt_e2e_1b", text: "Jakarta" },
      { id: "opt_e2e_1c", text: "Bandung" },
      { id: "opt_e2e_1d", text: "Medan" },
    ],
    correctOptionId: "opt_e2e_1b",
    orderIndex: 0,
  },
  {
    id: "q_e2e_2",
    text: "E2E Soal 2: Berapa hasil dari 2 + 2?",
    options: [
      { id: "opt_e2e_2a", text: "3" },
      { id: "opt_e2e_2b", text: "5" },
      { id: "opt_e2e_2c", text: "4" },
      { id: "opt_e2e_2d", text: "6" },
    ],
    correctOptionId: "opt_e2e_2c",
    orderIndex: 1,
  },
  {
    id: "q_e2e_3",
    text: "E2E Soal 3: Warna langit pada siang hari cerah?",
    options: [
      { id: "opt_e2e_3a", text: "Merah" },
      { id: "opt_e2e_3b", text: "Hijau" },
      { id: "opt_e2e_3c", text: "Kuning" },
      { id: "opt_e2e_3d", text: "Biru" },
    ],
    correctOptionId: "opt_e2e_3d",
    orderIndex: 2,
  },
];

// Use shared question data for both exams, with a suffix to keep IDs unique
function questionsFor(examId: string, suffix: string) {
  return EXAM_QUESTIONS.map((q) => ({
    ...q,
    id: `${q.id}_${suffix}`,
    correctOptionId: `${q.correctOptionId}_${suffix}`,
    options: q.options.map((o) => ({
      id: `${o.id}_${suffix}`,
      text: o.text,
    })),
    examId,
  }));
}

export async function seedE2E(): Promise<void> {
  const pool = createPool();
  try {
    const hash = await bcrypt.hash("student@123", 10);

    // Group
    await pool.execute(
      "INSERT INTO `groups` (id, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)",
      [E2E_GROUP.id, E2E_GROUP.name]
    );

    // Students
    for (const student of [E2E_STUDENT, E2E_STUDENT_ALT]) {
      await pool.execute(
        `INSERT INTO users (id, nis, \`name\`, \`password\`, role, is_active, group_id)
         VALUES (?, ?, ?, ?, 'student', 1, ?)
         ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), is_active = 1, group_id = VALUES(group_id)`,
        [student.id, student.nis, student.name, hash, E2E_GROUP.id]
      );
    }

    // Console users (admin + supervisor — no group)
    const adminHash = await bcrypt.hash(E2E_ADMIN.password, 10);
    await pool.execute(
      `INSERT INTO users (id, nis, \`name\`, \`password\`, role, is_active, group_id)
       VALUES (?, ?, ?, ?, 'admin', 1, NULL)
       ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), is_active = 1`,
      [E2E_ADMIN.id, E2E_ADMIN.nis, E2E_ADMIN.name, adminHash]
    );

    const supervisorHash = await bcrypt.hash(E2E_SUPERVISOR.password, 10);
    await pool.execute(
      `INSERT INTO users (id, nis, \`name\`, \`password\`, role, is_active, group_id)
       VALUES (?, ?, ?, ?, 'supervisor', 1, NULL)
       ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), is_active = 1`,
      [E2E_SUPERVISOR.id, E2E_SUPERVISOR.nis, E2E_SUPERVISOR.name, supervisorHash]
    );

    const oneYearMs = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const expiredAt = new Date(oneYearMs);

    // Exams
    await pool.execute(
      `INSERT INTO exams (id, title, duration_minutes, is_active, token, expired_at, randomize_question, randomize_answer)
       VALUES (?, ?, 60, 1, NULL, ?, 0, 0)
       ON DUPLICATE KEY UPDATE title = VALUES(title), is_active = 1`,
      [E2E_EXAM.id, E2E_EXAM.title, expiredAt]
    );
    await pool.execute(
      `INSERT INTO exams (id, title, duration_minutes, is_active, token, expired_at, randomize_question, randomize_answer)
       VALUES (?, ?, 60, 1, ?, ?, 0, 0)
       ON DUPLICATE KEY UPDATE title = VALUES(title), is_active = 1`,
      [E2E_EXAM_TOKEN.id, E2E_EXAM_TOKEN.title, E2E_EXAM_TOKEN.token, expiredAt]
    );

    // Exam-group links
    for (const examId of [E2E_EXAM.id, E2E_EXAM_TOKEN.id]) {
      await pool.execute(
        "INSERT IGNORE INTO exam_groups (exam_id, group_id) VALUES (?, ?)",
        [examId, E2E_GROUP.id]
      );
    }

    // Questions + options for both exams
    for (const [examId, suffix] of [[E2E_EXAM.id, "open"], [E2E_EXAM_TOKEN.id, "tok"]] as const) {
      for (const q of questionsFor(examId, suffix)) {
        await pool.execute(
          `INSERT INTO questions (id, exam_id, text, correct_option_id, order_index)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE text = VALUES(text)`,
          [q.id, q.examId, q.text, q.correctOptionId, q.orderIndex]
        );
        for (const opt of q.options) {
          await pool.execute(
            "INSERT INTO options (id, question_id, text) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE text = VALUES(text)",
            [opt.id, q.id, opt.text]
          );
        }
      }
    }
  } finally {
    await pool.end();
  }
}

/**
 * Seeds one pre-graded, submitted session for the recap E2E (#19): a DEDICATED
 * recap student on the open exam, 2 of 3 questions correct → score 67. Uses its
 * own student (not E2E_STUDENT/ALT) so the submitted session never collides with
 * the resume/reset specs. Runs AFTER resetE2ESessions() in global-setup.
 * Idempotent via INSERT ... ON DUPLICATE KEY UPDATE.
 */
export async function seedRecapSession(): Promise<void> {
  const pool = createPool();
  try {
    const hash = await bcrypt.hash("student@123", 10);

    // Dedicated recap student (in the e2e group so groupName renders).
    await pool.execute(
      `INSERT INTO users (id, nis, \`name\`, \`password\`, role, is_active, group_id)
       VALUES (?, ?, ?, ?, 'student', 1, ?)
       ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), is_active = 1, group_id = VALUES(group_id)`,
      [E2E_RECAP.studentId, E2E_RECAP.studentNis, E2E_RECAP.studentName, hash, E2E_GROUP.id]
    );

    const start = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const end = start + 60 * 60 * 1000;

    await pool.execute(
      `INSERT INTO exam_sessions (id, exam_id, user_id, start_time, end_time, submitted)
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE exam_id = VALUES(exam_id), user_id = VALUES(user_id),
         start_time = VALUES(start_time), end_time = VALUES(end_time), submitted = 1`,
      [E2E_RECAP.sessionId, E2E_RECAP.examId, E2E_RECAP.studentId, start, end]
    );

    // 2 correct (q1, q2) + 1 wrong (q3) for the "open" exam → score 67.
    const picks: Array<[string, string, string]> = [
      ["ans_e2e_recap_1", "q_e2e_1_open", "opt_e2e_1b_open"], // correct
      ["ans_e2e_recap_2", "q_e2e_2_open", "opt_e2e_2c_open"], // correct
      ["ans_e2e_recap_3", "q_e2e_3_open", "opt_e2e_3a_open"], // wrong (correct is _3d_open)
    ];
    for (const [id, questionId, selectedOptionId] of picks) {
      await pool.execute(
        `INSERT INTO answers (id, session_id, question_id, selected_option_id, timestamp, is_flagged)
         VALUES (?, ?, ?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE selected_option_id = VALUES(selected_option_id)`,
        [id, E2E_RECAP.sessionId, questionId, selectedOptionId, start]
      );
    }
  } finally {
    await pool.end();
  }
}
