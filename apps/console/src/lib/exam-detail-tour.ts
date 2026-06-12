/**
 * Azhura CBT Console — Exam detail page tour (#165).
 *
 * Step definitions for the on-demand tour of `/exams/:id` (ExamDetailPage).
 * Each step anchors to an element tagged `data-tour-page="<anchor>"` on that
 * page and explains it in plain Indonesian for non-technical school operators.
 * The tour follows the order an operator naturally works: read the exam info,
 * check participants, adjust settings, assign supervisors, then manage
 * questions.
 */

import { runPageTour, type PageTourStep } from "./page-tours";

/** Stable anchor ids; ExamDetailPage tags elements with `data-tour-page`. */
export type ExamDetailTourAnchor =
  | "exam-info"
  | "sessions-button"
  | "edit-exam"
  | "supervisors"
  | "questions"
  | "add-question";

interface ExamDetailStepDef {
  anchor: ExamDetailTourAnchor;
  title: string;
  description: string;
}

/** The exam detail tour, in operator working order. */
export const EXAM_DETAIL_TOUR_STEPS: readonly ExamDetailStepDef[] = [
  {
    anchor: "exam-info",
    title: "Informasi ujian",
    description:
      "Kartu ini merangkum ujian: judul, kode masuk yang dibagikan ke peserta, lama pengerjaan, batas waktu, dan grup yang boleh mengerjakan.",
  },
  {
    anchor: "sessions-button",
    title: "Status peserta",
    description:
      "Klik di sini untuk melihat siapa saja yang sedang atau sudah mengerjakan ujian ini. Dari sana Anda juga bisa mereset peserta yang selesai karena tidak sengaja.",
  },
  {
    anchor: "edit-exam",
    title: "Edit ujian",
    description:
      "Gunakan tombol ini untuk mengubah pengaturan ujian, misalnya judul, lama pengerjaan, atau batas waktunya.",
  },
  {
    anchor: "supervisors",
    title: "Pengawas",
    description:
      "Bagian ini menampilkan pengawas yang ditugaskan memantau ujian. Klik \"Kelola pengawas\" untuk menambah atau melepas pengawas.",
  },
  {
    anchor: "questions",
    title: "Daftar soal",
    description:
      "Seluruh soal ujian ada di bawah bagian ini. Setiap soal bisa diubah lewat ikon pensil atau dihapus lewat ikon tempat sampah. Saat ada peserta yang sedang mengerjakan, soal dikunci sementara.",
  },
  {
    anchor: "add-question",
    title: "Tambah soal",
    description:
      "Klik tombol ini untuk membuat soal baru. Ada empat jenis soal: Pilihan Ganda, Isi Jawaban, Pasangkan, dan Urutkan. Saat ada peserta yang sedang mengerjakan, tombol ini dikunci sementara.",
  },
];

function toPageTourSteps(): PageTourStep[] {
  return EXAM_DETAIL_TOUR_STEPS.map((step) => ({
    element: `[data-tour-page="${step.anchor}"]`,
    title: step.title,
    description: step.description,
  }));
}

/** Starts the exam detail tour (triggered by the page's tour button). */
export async function runExamDetailTour(): Promise<void> {
  await runPageTour(toPageTourSteps());
}
