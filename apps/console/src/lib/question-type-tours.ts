/**
 * Azhura CBT Console — Per-question-type tours for the question form (#165).
 *
 * One guided tour per question type (Pilihan Ganda, Isi Jawaban, Pasangkan,
 * Urutkan) on `/exams/:id/questions/new|:id/edit`. Each tour walks the operator
 * through composing that type of question, step by step, by highlighting the
 * real form fields — anchored via `data-tour-form="<anchor>"` on the form
 * elements (AdminQuestionFormPage + the type-specific sub-forms).
 *
 * The form page renders ONE adaptive trigger button next to the type selector:
 * its icon + label ("Apa itu …?") always mirror the active type, and clicking
 * it starts that type's tour — so every anchored field is already on screen.
 * In edit mode the type is locked, and the trigger simply stays on the type
 * being edited.
 */

import type { QuestionType } from "@azhura/shared";
import { runPageTour, type PageTourStep } from "./page-tours";

/** Stable anchor ids; form elements are tagged with `data-tour-form`. */
export type QuestionFormTourAnchor =
  | "question-type"
  | "question-text"
  | "actions"
  | "mc-options"
  | "mc-add-option"
  | "mc-preview"
  | "fib-answers"
  | "fib-add-answer"
  | "matching-pairs"
  | "matching-add-pair"
  | "sorting-items"
  | "sorting-add-item";

interface QuestionFormStepDef {
  anchor: QuestionFormTourAnchor;
  title: string;
  description: string;
}

/** One tour: the trigger-button label plus its ordered steps. */
export interface QuestionTypeTour {
  /** Human label of the type (matches the form's type selector). */
  typeLabel: string;
  /** Trigger-button label, e.g. "Apa itu Pilihan Ganda?". */
  buttonLabel: string;
  steps: readonly QuestionFormStepDef[];
}

const STEP_TYPE_SELECTOR = (typeLabel: string): QuestionFormStepDef => ({
  anchor: "question-type",
  title: "Jenis soal",
  description: `Soal jenis ${typeLabel} dipilih di sini. Jenis soal hanya bisa dipilih saat membuat soal baru — setelah disimpan, jenisnya tidak bisa diubah lagi.`,
});

const STEP_QUESTION_TEXT: QuestionFormStepDef = {
  anchor: "question-text",
  title: "Teks soal",
  description:
    "Tulis pertanyaan atau perintah soal di kotak ini. Anda bisa menyisipkan gambar, audio, atau video lewat tombol media di bagian atas kotak.",
};

const STEP_SAVE: QuestionFormStepDef = {
  anchor: "actions",
  title: "Simpan soal",
  description:
    "Setelah semuanya terisi, tekan tombol simpan. Anda akan kembali ke daftar soal ujian dan bisa langsung menambah soal berikutnya.",
};

export const QUESTION_TYPE_TOURS: Record<QuestionType, QuestionTypeTour> = {
  multiple_choice: {
    typeLabel: "Pilihan Ganda",
    buttonLabel: "Apa itu Pilihan Ganda?",
    steps: [
      STEP_TYPE_SELECTOR("Pilihan Ganda"),
      STEP_QUESTION_TEXT,
      {
        anchor: "mc-options",
        title: "Pilihan jawaban",
        description:
          "Tulis pilihan jawaban A, B, C, dan seterusnya di sini. Klik bulatan di sebelah kiri huruf untuk menandai jawaban yang benar — hanya satu yang benar.",
      },
      {
        anchor: "mc-add-option",
        title: "Tambah pilihan",
        description:
          "Perlu pilihan lebih banyak? Klik di sini untuk menambah, paling banyak enam pilihan. Pilihan yang berlebih bisa dihapus lewat ikon tempat sampah.",
      },
      {
        anchor: "mc-preview",
        title: "Lihat tampilan soal",
        description:
          "Klik \"Preview\" untuk melihat soal persis seperti yang nanti dilihat peserta, sebelum Anda menyimpannya.",
      },
      STEP_SAVE,
    ],
  },
  fill_in_blank: {
    typeLabel: "Isi Jawaban",
    buttonLabel: "Apa itu Isi Jawaban?",
    steps: [
      STEP_TYPE_SELECTOR("Isi Jawaban"),
      {
        anchor: "question-text",
        title: "Teks soal",
        description:
          "Tulis pertanyaan yang jawabannya berupa isian singkat, misalnya \"Ibu kota Indonesia adalah …\". Gambar, audio, dan video juga bisa disisipkan.",
      },
      {
        anchor: "fib-answers",
        title: "Jawaban benar",
        description:
          "Ketik jawaban yang dianggap benar di sini. Huruf besar/kecil tidak dibedakan, dan spasi di awal/akhir diabaikan, jadi \"jakarta\" dan \"Jakarta\" sama-sama benar.",
      },
      {
        anchor: "fib-add-answer",
        title: "Jawaban alternatif",
        description:
          "Kalau ada beberapa cara menjawab yang sama-sama benar (misalnya \"DKI Jakarta\"), tambahkan di sini. Jawaban peserta dianggap benar jika cocok dengan salah satunya.",
      },
      STEP_SAVE,
    ],
  },
  matching: {
    typeLabel: "Pasangkan",
    buttonLabel: "Apa itu Pasangkan?",
    steps: [
      STEP_TYPE_SELECTOR("Pasangkan"),
      {
        anchor: "question-text",
        title: "Teks soal",
        description:
          "Tulis perintah soalnya, misalnya \"Pasangkan negara dengan ibu kotanya\". Peserta nanti menjodohkan isi Kolom A dengan Kolom B.",
      },
      {
        anchor: "matching-pairs",
        title: "Pasangan jawaban",
        description:
          "Isi Kolom A dan pasangan benarnya di Kolom B pada baris yang sama. Saat ujian, urutan pilihan diacak otomatis untuk peserta.",
      },
      {
        anchor: "matching-add-pair",
        title: "Tambah pasangan",
        description:
          "Klik di sini untuk menambah baris pasangan baru. Minimal ada dua pasangan dalam satu soal.",
      },
      STEP_SAVE,
    ],
  },
  sorting: {
    typeLabel: "Urutkan",
    buttonLabel: "Apa itu Urutkan?",
    steps: [
      STEP_TYPE_SELECTOR("Urutkan"),
      {
        anchor: "question-text",
        title: "Teks soal",
        description:
          "Tulis perintah soalnya, misalnya \"Urutkan peristiwa berikut dari yang paling awal\". Peserta nanti menyusun item ke urutan yang benar.",
      },
      {
        anchor: "sorting-items",
        title: "Item dan urutan benar",
        description:
          "Tulis item-itemnya dalam urutan yang BENAR — urutan di form ini adalah kunci jawabannya. Gunakan panah naik/turun untuk merapikan urutan. Saat ujian, item diacak untuk peserta.",
      },
      {
        anchor: "sorting-add-item",
        title: "Tambah item",
        description:
          "Klik di sini untuk menambah item. Minimal ada tiga item dalam satu soal.",
      },
      STEP_SAVE,
    ],
  },
};

function toPageTourSteps(type: QuestionType): PageTourStep[] {
  return QUESTION_TYPE_TOURS[type].steps.map((step) => ({
    element: `[data-tour-form="${step.anchor}"]`,
    title: step.title,
    description: step.description,
  }));
}

/** Starts the tour for one question type (the form must already show it). */
export async function runQuestionTypeTour(type: QuestionType): Promise<void> {
  await runPageTour(toPageTourSteps(type));
}
