/**
 * Deletes all exam_sessions (and cascading answers/session_questions) for the
 * two e2e students, and clears their Redis session-claim keys.
 * Run before each e2e test suite so submit tests can re-run.
 */

import mysql from "mysql2/promise";
import { E2E_STUDENT, E2E_STUDENT_ALT } from "../data/users.ts";
import { clearE2ERedisClaimsForE2EUsers } from "./redis-utils.ts";

function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "azhura_cbt",
  });
}

export async function resetE2ESessions(): Promise<void> {
  const pool = createPool();
  try {
    const userIds = [E2E_STUDENT.id, E2E_STUDENT_ALT.id];
    const placeholders = userIds.map(() => "?").join(", ");

    // Get session IDs for e2e users
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT id FROM exam_sessions WHERE user_id IN (${placeholders})`,
      userIds
    );
    const sessionIds = rows.map((r: mysql.RowDataPacket) => r["id"] as string);

    if (sessionIds.length > 0) {
      const sPlaceholders = sessionIds.map(() => "?").join(", ");

      // Delete in FK-safe order (child rows first)
      await pool.execute(`DELETE FROM answers WHERE session_id IN (${sPlaceholders})`, sessionIds);
      await pool.execute(`DELETE FROM session_questions WHERE session_id IN (${sPlaceholders})`, sessionIds);
      await pool.execute(`DELETE FROM cheat_logs WHERE session_id IN (${sPlaceholders})`, sessionIds);
      await pool.execute(`DELETE FROM exam_sessions WHERE id IN (${sPlaceholders})`, sessionIds);
    }
  } finally {
    await pool.end();
  }

  await clearE2ERedisClaimsForE2EUsers();
}
