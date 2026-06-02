/**
 * Student client - type re-export.
 *
 * Domain models now live in `@azhura/shared` (single source of truth shared
 * with the console + backend). This re-export keeps existing `@/types` imports
 * working. Add student-only types below the re-export if ever needed.
 */

export * from "@azhura/shared";
