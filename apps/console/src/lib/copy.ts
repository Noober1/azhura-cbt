/**
 * Azhura CBT Console — Plain-language copy glossary (#138).
 *
 * Single place for friendly, non-technical Indonesian wording so the console
 * speaks the language of school operators — not developers. Keep terms short,
 * concrete, and free of jargon ("upsert", "sync", "batch", "schema", "parse",
 * "token", "spreadsheet"). When a technical idea is unavoidable, explain it in
 * everyday words here, then reuse it everywhere instead of re-inventing copy.
 *
 * Scope: this is the glossary + its application to the import dialogs. It is NOT
 * a full rewrite of every page string — that can follow later. New onboarding,
 * tour, and help copy must pull from here (or `help-content.ts`) so the plain
 * voice stays consistent.
 */

/**
 * The two ways the participant import can run. We deliberately avoid the words
 * "Import" and "Sync" in the UI because they mean nothing to a school operator.
 */
export interface ImportModeCopy {
  /** Short button label shown in the mode toggle. */
  label: string;
  /** One-line plain explanation shown beside the toggle. */
  hint: string;
}

export const IMPORT_MODE_COPY: Record<"import" | "sync", ImportModeCopy> = {
  import: {
    label: "Tambah / Perbarui",
    hint: "Menambah peserta baru dan memperbarui data peserta yang sudah ada. Tidak ada peserta yang dihapus.",
  },
  sync: {
    label: "Samakan dengan file",
    hint: "Membuat daftar peserta sama persis seperti isi file. Peserta yang tidak ada di file akan dihapus, kecuali yang pernah mengikuti ujian.",
  },
};

/**
 * Friendly fallbacks for jargon-heavy strings. Centralised so the same wording
 * is reused if these messages appear in more than one place.
 */
export const COPY = {
  /** Shown when a chosen file is not a supported type. Tells the operator what to do next. */
  unsupportedFile:
    "File ini belum bisa dibaca. Gunakan file Excel (.xlsx) atau file daftar (.csv). Klik \"Unduh contoh file\" jika belum punya.",

  /** Plain label for the downloadable starter file (avoids the word "template/spreadsheet"). */
  downloadExampleFile: "Unduh contoh file",

  /** Short, reusable warning core for the destructive "Samakan dengan file" mode. */
  syncDeletesWarning:
    "Mode ini menghapus peserta yang tidak ada di file. Peserta yang pernah mengikuti ujian tetap aman dan tidak dihapus.",
} as const;
