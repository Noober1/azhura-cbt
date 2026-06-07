/**
 * Azhura CBT Backend - Database Connection (Drizzle ORM + mysql2)
 *
 * Creates a shared `mysql2/promise` connection pool from the validated
 * environment configuration and wraps it with Drizzle ORM. Importing this module
 * also triggers env validation (via {@link getDbConfig}), so misconfiguration
 * fails fast at startup.
 *
 * Exports:
 * - default `db`            — the Drizzle query client used across the app.
 * - `pool`                  — raw mysql2 pool (used by the migrator + shutdown).
 * - `schema`               — re-exported tables for `db.query.*` access.
 * - `assertDbConnection()`  — verifies connectivity during bootstrap.
 */

import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { getDbConfig } from "../lib/env";
import { createLogger } from "../lib/logger";
import * as schema from "./schema";

const log = createLogger("DB");

const config = getDbConfig();

/** Shared mysql2 pool. Exposed for the migrator and graceful shutdown. */
export const pool = mysql.createPool({
  host: config.host,
  port: config.port,
  user: config.user,
  password: config.password,
  database: config.database,
  waitForConnections: true,
  connectionLimit: 10,
  // utf8mb4 so 4-byte code points (emoji in chat messages, #17) round-trip
  // correctly; mysql2 otherwise defaults to utf8mb3 and would corrupt them.
  charset: "utf8mb4",
});

/** The Drizzle query client. Import this for all data access. */
export const db: MySql2Database<typeof schema> = drizzle(pool, {
  schema,
  mode: "default",
});

export { schema };

/**
 * Verifies the pool can actually reach the database, logging a clear, traceable
 * message on failure. Call once during server bootstrap.
 *
 * @throws Re-throws the underlying connection error so startup aborts loudly.
 */
export const assertDbConnection = async (): Promise<void> => {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    log.info("Database connection established.", {
      host: config.host,
      database: config.database,
    });
  } catch (error) {
    log.error("Failed to connect to database", error, {
      host: config.host,
      port: config.port,
      database: config.database,
    });
    throw error;
  }
};

export default db;
