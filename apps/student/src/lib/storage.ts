/**
 * Azhura CBT App - Offline Answer Storage (Hybrid SQLite + localStorage)
 *
 * Provides a single persistence API for exam answers that works in both
 * environments the app ships to:
 * - **Tauri (desktop):** answers are stored in a local SQLite database
 *   (`cbt_offline.db`) via `@tauri-apps/plugin-sql`.
 * - **Web browser:** falls back to `localStorage` under `cbt_offline_answers`.
 *
 * Every SQLite operation degrades gracefully to the localStorage fallback if
 * the database is unavailable or errors, and all failures are logged with
 * structured context so a sync problem can be traced to its source.
 */

import { ExamAnswer } from "../types";
import { createLogger } from "./logger";
import { safeJsonParse } from "./errors";

const log = createLogger("Storage");

/** localStorage key holding the web-fallback answers map. */
const LOCAL_KEY = "cbt_offline_answers";

/** Map of questionId -> answer, used for the localStorage fallback shape. */
type AnswerMap = Record<string, ExamAnswer>;

/**
 * Minimal shape of the Tauri SQL plugin `Database` instance we rely on.
 * Kept narrow (instead of `any`) so misuse is caught at compile time.
 */
interface TauriDatabase {
  execute: (query: string, bindValues?: unknown[]) => Promise<unknown>;
  select: <T>(query: string, bindValues?: unknown[]) => Promise<T>;
}

/** @returns `true` when running inside a Tauri WebView (desktop build). */
const isTauri = (): boolean =>
  typeof window !== "undefined" &&
  (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !==
    undefined;

/** Cached SQLite handle; lazily initialized on first use in Tauri. */
let db: TauriDatabase | null = null;

/**
 * Lazily initializes (and memoizes) the SQLite database when running in Tauri.
 *
 * @returns The database handle, or `null` when not in Tauri or init failed
 *          (callers must then use the localStorage fallback).
 */
const getDatabase = async (): Promise<TauriDatabase | null> => {
  if (!isTauri()) return null;
  if (db) return db;

  try {
    // Dynamic import prevents bundler resolution errors in plain web browsers.
    const Database = (await import("@tauri-apps/plugin-sql")).default;
    db = (await Database.load("sqlite:cbt_offline.db")) as unknown as TauriDatabase;

    await db.execute(`
      CREATE TABLE IF NOT EXISTS answers (
        questionId TEXT PRIMARY KEY,
        selectedOptionId TEXT,
        timestamp INTEGER,
        isFlagged INTEGER
      )
    `);
    log.info("SQLite database initialized and table prepared.");
    return db;
  } catch (error) {
    log.error("Failed to initialize SQLite database", error);
    db = null;
    return null;
  }
};

/** Reads the localStorage answer map, tolerating corrupted/missing data. */
const readLocalAnswers = (): AnswerMap => {
  if (typeof window === "undefined") return {};
  return safeJsonParse<AnswerMap>(
    localStorage.getItem(LOCAL_KEY),
    {},
    LOCAL_KEY
  );
};

/** Persists an answer to the localStorage fallback store. */
const saveAnswerToLocalStorage = (answer: ExamAnswer): void => {
  if (typeof window === "undefined") return;
  try {
    const answersMap = readLocalAnswers();
    answersMap[answer.questionId] = answer;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(answersMap));
  } catch (error) {
    // Quota exceeded or serialization failure — surface it, do not swallow.
    log.error("Failed to write answer to localStorage", error, {
      questionId: answer.questionId,
    });
  }
};

/**
 * Saves a single answer to local offline storage (SQLite, or localStorage
 * fallback). Never throws: failures are logged and routed to the fallback so
 * answer capture is never lost mid-exam.
 *
 * @param answer The answer to persist.
 */
export const saveAnswerToLocalDb = async (answer: ExamAnswer): Promise<void> => {
  const database = await getDatabase();

  if (database) {
    try {
      await database.execute(
        `INSERT OR REPLACE INTO answers (questionId, selectedOptionId, timestamp, isFlagged)
         VALUES ($1, $2, $3, $4)`,
        [
          answer.questionId,
          answer.selectedOptionId || "",
          answer.timestamp,
          answer.isFlagged ? 1 : 0,
        ]
      );
      return;
    } catch (error) {
      log.error("SQLite save failed, falling back to localStorage", error, {
        questionId: answer.questionId,
      });
    }
  }

  saveAnswerToLocalStorage(answer);
};

/**
 * Retrieves all offline answers currently saved (SQLite, or localStorage
 * fallback). Never throws: returns an empty array if both sources fail.
 *
 * @returns The list of persisted answers (possibly empty).
 */
export const getAnswersFromLocalDb = async (): Promise<ExamAnswer[]> => {
  const database = await getDatabase();

  if (database) {
    try {
      const rows = await database.select<
        Array<{
          questionId: string;
          selectedOptionId: string;
          timestamp: number;
          isFlagged: number;
        }>
      >("SELECT * FROM answers");
      return rows.map((row) => ({
        questionId: row.questionId,
        selectedOptionId: row.selectedOptionId === "" ? null : row.selectedOptionId,
        timestamp: row.timestamp,
        isFlagged: row.isFlagged === 1,
      }));
    } catch (error) {
      log.error("SQLite read failed, falling back to localStorage", error);
    }
  }

  return Object.values(readLocalAnswers());
};

/**
 * Clears all locally stored answers after a successful server submission, so a
 * stale offline cache cannot resurrect old answers into a new session.
 * Never throws.
 */
export const clearLocalDbAnswers = async (): Promise<void> => {
  const database = await getDatabase();

  if (database) {
    try {
      await database.execute("DELETE FROM answers");
      log.info("SQLite answers table cleared.");
      return;
    } catch (error) {
      log.error("SQLite clear failed, falling back to localStorage", error);
    }
  }

  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(LOCAL_KEY);
    } catch (error) {
      log.error("Failed to clear localStorage answers", error);
    }
  }
};
