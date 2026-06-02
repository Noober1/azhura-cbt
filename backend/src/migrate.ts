/**
 * Azhura CBT Backend - Database Migration Runner (Drizzle)
 *
 * Applies any pending migrations from the `migrations/` folder using Drizzle's
 * mysql2 migrator. Migrations are generated from `src/db/schema.ts` with
 * `bun run db:generate`; this script then applies them idempotently — Drizzle
 * tracks which have already run in its `__drizzle_migrations` table.
 *
 * Run with: `bun run migrate`.
 */

import { migrate } from "drizzle-orm/mysql2/migrator";
import { db, pool } from "./db";
import { createLogger } from "./lib/logger";

const log = createLogger("Migrate");

const runMigrations = async (): Promise<void> => {
  log.info("Applying pending migrations...", { folder: "./migrations" });
  await migrate(db, { migrationsFolder: "./migrations" });
  log.info("Migrations complete. Schema is up to date.");
};

try {
  await runMigrations();
} catch (error) {
  // Surface a clear, non-zero exit so CI/scripts can detect failure.
  log.error("Migration aborted", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
