/**
 * drizzle-kit configuration.
 *
 * - `bun run db:generate` — diff schema → emit SQL migrations into ./migrations
 * - `bun run db:push`     — push schema straight to the DB (dev convenience)
 * - `bun run migrate`     — apply pending migrations (see src/migrate.ts)
 */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dbCredentials: {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "azhura_cbt",
  },
  verbose: true,
  strict: true,
});
