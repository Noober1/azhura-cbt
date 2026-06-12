/**
 * Azhura CBT Console — helper tampilan soal bersama.
 *
 * Dipakai oleh halaman daftar soal admin (<ExamDetailPage/>) dan supervisor
 * (<SupervisorQuestionListPage/>) lewat <QuestionCard/> agar parsing config
 * dan label tipe soal tidak terduplikasi.
 */

import type { QuestionType } from "@azhura/shared";

/**
 * Parse kolom `config` soal yang bisa datang sebagai objek (sudah ter-parse)
 * atau string JSON mentah dari API. Mengembalikan `null` untuk nilai kosong
 * maupun JSON yang rusak — pemanggil cukup menangani satu bentuk fallback.
 */
export function parseConfig<T>(raw: unknown): T | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return raw as T;
}

/** Metadata badge tipe soal: label Bahasa Indonesia + kelas warna badge. */
export const QUESTION_TYPE_LABELS: Record<QuestionType, { label: string; className: string }> = {
  multiple_choice: { label: "Pilihan Ganda", className: "bg-blue-50 text-blue-700 border-blue-200" },
  fill_in_blank:   { label: "Isi Jawaban",   className: "bg-violet-50 text-violet-700 border-violet-200" },
  matching:        { label: "Pasangkan",      className: "bg-amber-50 text-amber-700 border-amber-200" },
  sorting:         { label: "Urutkan",        className: "bg-teal-50 text-teal-700 border-teal-200" },
};
