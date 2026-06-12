/**
 * Static content + visibility rules for the in-exam help dialog (#166).
 *
 * The dialog itself is a plain controlled Dialog (no driver.js overlay), so it
 * is safe to open even while anti-cheat lockdown is enforced. Content lives
 * here as pure data so the node vitest env can verify the required topics and
 * the shortcut legend without rendering React.
 */

/** Stable topic ids — each maps to a required help topic from #166. */
export type ExamHelpTopicId = "timer" | "grid" | "flag" | "autosave" | "submit";

export interface ExamHelpSection {
  id: ExamHelpTopicId;
  title: string;
  description: string;
}

export interface ExamShortcutLegendItem {
  /** Human-readable key combo, e.g. "A – F". */
  keys: string;
  description: string;
}

/** Which help affordances the exam header shows for a given lockdown state. */
export interface ExamHelpVisibility {
  /** The static help dialog — always available, even under lockdown. */
  staticHelp: boolean;
  /** The driver.js tour replay — safe-context only (#145). */
  tourReplay: boolean;
}

export const EXAM_HELP_SECTIONS: readonly ExamHelpSection[] = [
  {
    id: "timer",
    title: "Sisa waktu",
    description:
      "Sisa waktu ujian tampil di pojok kanan atas. Saat waktu habis, jawaban kamu langsung dikumpulkan secara otomatis — tidak perlu panik, semua jawaban yang sudah diisi ikut terkirim.",
  },
  {
    id: "grid",
    title: "Nomor soal",
    description:
      "Kotak nomor di sisi kiri menunjukkan status tiap soal: abu-abu berarti belum dijawab, biru sudah dijawab, dan kuning ditandai ragu-ragu. Klik nomor mana pun untuk langsung pindah ke soal itu.",
  },
  {
    id: "flag",
    title: "Tombol Ragu-Ragu",
    description:
      "Belum yakin dengan jawabanmu? Tekan tombol Ragu-Ragu untuk menandai soal supaya mudah dicek lagi nanti. Tekan sekali lagi untuk menghapus tandanya.",
  },
  {
    id: "autosave",
    title: "Simpan otomatis",
    description:
      "Setiap jawaban yang kamu pilih atau ketik tersimpan secara otomatis. Jawaban tetap aman walaupun koneksi internet terputus sebentar.",
  },
  {
    id: "submit",
    title: "Selesai ujian",
    description:
      "Tombol Kumpulkan Ujian muncul di soal terakhir. Sebelum mengonfirmasi, periksa ringkasan jumlah soal yang sudah dijawab dan yang masih ragu-ragu.",
  },
];

export const EXAM_SHORTCUT_LEGEND: readonly ExamShortcutLegendItem[] = [
  { keys: "← / →", description: "Pindah ke soal sebelumnya / berikutnya" },
  { keys: "A – F", description: "Pilih jawaban pada soal pilihan ganda" },
  { keys: "R", description: "Tandai / lepas tanda ragu-ragu" },
  { keys: "Enter", description: "Simpan jawaban isian dan keluar dari kotak ketik" },
];

/**
 * The static help dialog must stay reachable even under lockdown — it is the
 * student's only in-exam help there. The tour replay stays safe-context only.
 */
export function getExamHelpVisibility(enforcementActive: boolean): ExamHelpVisibility {
  return { staticHelp: true, tourReplay: !enforcementActive };
}
