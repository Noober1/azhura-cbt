/**
 * Azhura CBT Backend — In-memory import session store.
 *
 * Dry-run results are cached here so the confirm endpoint can execute without
 * re-parsing the file. Sessions expire after 5 minutes; they are also deleted
 * immediately after a successful confirm to prevent replay.
 */

import { randomUUID } from "crypto";

const TTL_MS = 5 * 60 * 1000; // 5 minutes

class ImportSessionStore<T> {
  private readonly map = new Map<string, { data: T; expiresAt: number }>();

  /** Persist data and return a new session ID. */
  create(data: T): string {
    const id = randomUUID();
    this.map.set(id, { data, expiresAt: Date.now() + TTL_MS });
    // Lazy GC: prune when the map grows large.
    if (this.map.size > 200) this.gc();
    return id;
  }

  /** Return the session data, or null when missing or expired. */
  get(id: string): T | null {
    const entry = this.map.get(id);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(id);
      return null;
    }
    return entry.data;
  }

  /** Remove a session (call after confirm to prevent replay). */
  delete(id: string): void {
    this.map.delete(id);
  }

  private gc(): void {
    const now = Date.now();
    for (const [id, entry] of this.map) {
      if (now > entry.expiresAt) this.map.delete(id);
    }
  }
}

// ---- Session payload shapes ----

export interface GroupImportRow {
  row: number;
  code: string;
  name: string;
  status: "valid" | "error";
  error?: string;
}

export interface GroupImportSession {
  rows: GroupImportRow[];
}

export interface StudentImportRow {
  row: number;
  nis: string;
  nama: string;
  grup: string;
  /** Resolved group ID — present only when status is "valid". */
  groupId?: string;
  /** Pre-hashed password for new students (absent for existing NIS). */
  hashedPassword?: string;
  /** UUID for new student rows. */
  newId?: string;
  /** True when this NIS already exists in the DB (update path). */
  isUpdate?: boolean;
  status: "valid" | "error";
  error?: string;
}

export interface StudentImportSession {
  mode: "import" | "sync";
  rows: StudentImportRow[];
  /** Student IDs to delete in Mode Sync (verified no exam history at dry-run). */
  toDeleteIds: string[];
  /** Students skipped from deletion because they have exam history. */
  skippedDeleteCount: number;
}

// ---- Rate limiter (prevents bcrypt DoS via repeated dry-runs) ----

const DRYRUN_COOLDOWN_MS = 10_000; // 10 seconds per user
const lastDryRunByUser = new Map<string, number>();

/**
 * Returns true when the user is allowed to start a new dry-run.
 * Call `markDryRun(userId)` immediately after to update the timestamp.
 * NOTE: single-process only — does not coordinate across replicas.
 */
export function canDryRun(userId: string): boolean {
  const last = lastDryRunByUser.get(userId);
  return last === undefined || Date.now() - last >= DRYRUN_COOLDOWN_MS;
}

export function markDryRun(userId: string): void {
  lastDryRunByUser.set(userId, Date.now());
}

// ---- Module-level singletons ----

export const groupImportSessions = new ImportSessionStore<GroupImportSession>();
export const studentImportSessions =
  new ImportSessionStore<StudentImportSession>();
