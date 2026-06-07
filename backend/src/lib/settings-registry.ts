/**
 * Azhura CBT Backend — System Settings Registry
 *
 * Single source of truth for every configurable application setting. The DB
 * stores settings as raw `(key, value: text)` rows; this registry owns:
 *
 * - The canonical `SystemSettings` shape (kept identical to `@azhura/shared`).
 * - `SETTINGS_DEFAULTS`: the fallback value for each key.
 * - `serialize` / `deserialize`: per-key type coercion (boolean/number ↔ text).
 * - `projectRows`: merges stored DB rows onto defaults, producing a full object.
 *
 * Adding a new setting: add the key + type to `SystemSettings`, a default to
 * `SETTINGS_DEFAULTS`, and a case to each switch in `serialize`/`deserialize`.
 * No DB migration needed.
 */

import type { Setting } from "../db/schema";

/** Global admin-editable application settings. Mirrors `@azhura/shared`. */
export interface SystemSettings {
  schoolName: string;
  schoolAddress: string;
  /** Default exam duration offered in the "new exam" form, in minutes. */
  defaultExamDurationMinutes: number;
  /** Default passing score (0–100) offered in the "new exam" form. */
  defaultPassingGrade: number;
  /** When true, anti-cheat engine is enabled for all student sessions. */
  antiCheatEnabled: boolean;
}

export const SETTINGS_DEFAULTS: Readonly<SystemSettings> = {
  schoolName: "Azhura CBT",
  schoolAddress: "",
  defaultExamDurationMinutes: 30,
  defaultPassingGrade: 0,
  antiCheatEnabled: false,
};

type SettingKey = keyof SystemSettings;

/** All valid setting keys. Used to reject unknown keys from PATCH bodies. */
export const SETTING_KEYS: ReadonlySet<string> = new Set<SettingKey>([
  "schoolName",
  "schoolAddress",
  "defaultExamDurationMinutes",
  "defaultPassingGrade",
  "antiCheatEnabled",
]);

/** Converts a typed setting value to its DB text representation. */
export function serialize(key: SettingKey, value: SystemSettings[SettingKey]): string {
  switch (key) {
    case "antiCheatEnabled":
      return (value as boolean) ? "true" : "false";
    case "defaultExamDurationMinutes":
    case "defaultPassingGrade":
      return String(value as number);
    case "schoolName":
    case "schoolAddress":
      return value as string;
    default: {
      // Exhaustive guard: TypeScript error here means a new key was added without a case.
      const _: never = key;
      return _ as never;
    }
  }
}

/** Parses a raw DB text value back to its typed representation. Returns the
 *  default for that key if the stored value cannot be coerced safely. */
export function deserialize(key: SettingKey, raw: string): SystemSettings[SettingKey] {
  switch (key) {
    case "antiCheatEnabled":
      return raw === "true";
    case "defaultExamDurationMinutes":
    case "defaultPassingGrade": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : SETTINGS_DEFAULTS[key];
    }
    case "schoolName":
    case "schoolAddress":
      return raw;
    default: {
      // Exhaustive guard: TypeScript error here means a new key was added without a case.
      const _: never = key;
      return _ as never;
    }
  }
}

/**
 * Merges stored DB rows onto defaults. Keys absent from the DB receive their
 * default value, so callers always get a complete `SystemSettings` object.
 */
export function projectRows(rows: Setting[]): SystemSettings {
  const result = { ...SETTINGS_DEFAULTS };
  for (const row of rows) {
    if (!SETTING_KEYS.has(row.key)) continue;
    const key = row.key as SettingKey;
    (result as Record<string, unknown>)[key] = deserialize(key, row.value);
  }
  return result;
}
