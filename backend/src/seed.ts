/**
 * Azhura CBT Backend - Database Seeder (Drizzle)
 *
 * Populates the database with demo data (students + a supervisor, one exam, and
 * its questions/options) using idempotent upserts (`onDuplicateKeyUpdate`), so
 * it can be re-run safely. Run with: `bun run seed`. Requires migrations to have
 * been applied first.
 */

import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, pool, schema } from "./db";
import { createLogger } from "./lib/logger";

const { users, exams, questions, options } = schema;

const log = createLogger("Seed");

const PASSWORD_HASH = await bcrypt.hash("student@123", 10);
const SUPERVISOR_HASH = await bcrypt.hash("supervisor@123", 10);

// ── Users ──────────────────────────────────────────────────────────────────
type SeedRole = "student" | "supervisor" | "admin";
const seedUsers: { id: string; nis: string; name: string; role: SeedRole }[] = [
  { id: "usr_1001", nis: "12345", name: "Ahmad Faisal",   role: "student" },
  { id: "usr_1002", nis: "67890", name: "Budi Santoso",   role: "student" },
  { id: "usr_1003", nis: "99999", name: "Citra Lestari",  role: "student" },
  { id: "usr_9001", nis: "00001", name: "Pengawas Utama", role: "supervisor" },
];

for (const u of seedUsers) {
  const password = u.role === "supervisor" ? SUPERVISOR_HASH : PASSWORD_HASH;
  await db
    .insert(users)
    .values({ id: u.id, nis: u.nis, password, name: u.name, role: u.role })
    .onDuplicateKeyUpdate({ set: { name: u.name } });
  log.info(`User upserted: ${u.name} (${u.nis})`);
}

// ── Exams, Questions & Options ──────────────────────────────────────────────
interface SeedQuestion {
  text: string;
  correctIndex: number;
  options: string[];
}

interface SeedExam {
  id: string;
  title: string;
  durationMinutes: number;
  /**
   * Prefix for generated question/option IDs, keeping them unique across exams.
   * The first exam uses "" to preserve the original `q_1` / `opt_1_a` IDs so
   * existing data upserts cleanly; new exams namespace their IDs.
   */
  idPrefix: string;
  questions: SeedQuestion[];
}

const programmingQuestions: SeedQuestion[] = [
  {
    text: "Manakah di bawah ini yang merupakan fungsi utama dari package manager 'Bun'?",
    correctIndex: 1,
    options: [
      "Mengompilasi kode Rust menjadi biner desktop native",
      "Menjadi runtime, bundler, test runner, dan package manager JavaScript/TypeScript yang super cepat",
      "Sebagai emulator database relasional secara virtual",
      "Menyediakan server WebSocket global secara otomatis",
    ],
  },
  {
    text: "Dalam arsitektur Tauri 2.x, apa fungsi utama dari Rust backend?",
    correctIndex: 1,
    options: [
      "Merender tampilan visual antarmuka pengguna (UI)",
      "Menangani operasi tingkat sistem yang aman, akses file native, dan manajemen window",
      "Menggantikan fungsionalitas React router secara penuh",
      "Melakukan enkripsi file biner HTML di sisi klien saja",
    ],
  },
  {
    text: "Manakah hook Zustand yang digunakan untuk mengakses state secara langsung di luar React render loop?",
    correctIndex: 0,
    options: [
      "useStore.getState()",
      "useStore.subscribe()",
      "useStore.setState()",
      "useStore.retrieve()",
    ],
  },
  {
    text: "Apa keuntungan menggunakan Tailwind CSS v4 dengan plugin official @tailwindcss/vite?",
    correctIndex: 1,
    options: [
      "Mengharuskan penggunaan file tailwind.config.js yang besar",
      "Integrasi super cepat langsung di level compiler Vite tanpa memerlukan PostCSS eksternal",
      "Mematikan fungsi hot module reloading (HMR) demi keamanan",
      "Mengubah sintaks penulisan JSX menjadi standard HTML biasa",
    ],
  },
  {
    text: "Manakah plugin Tauri yang paling tepat digunakan untuk menyimpan data kredensial JWT secara terenkripsi?",
    correctIndex: 2,
    options: [
      "@tauri-apps/plugin-sql",
      "@tauri-apps/plugin-opener",
      "@tauri-apps/plugin-stronghold",
      "@tauri-apps/plugin-fs",
    ],
  },
  {
    text: "Manakah keuntungan menggunakan SQLite lokal dalam aplikasi CBT desktop?",
    correctIndex: 1,
    options: [
      "Menyediakan proteksi anti-cheat di sisi jaringan",
      "Penyimpanan jawaban sementara siswa yang cepat, andal, dan bekerja secara offline penuh",
      "Membatasi layar monitor ganda secara otomatis",
      "Mengirimkan log kecurangan secara langsung ke pengawas",
    ],
  },
  {
    text: "Dalam React Hook Form, prop apa yang digunakan untuk menghubungkan skema Zod dengan form handling?",
    correctIndex: 2,
    options: [
      "zodValidator",
      "schemaResolver",
      "zodResolver dari package @hookform/resolvers",
      "formValidationEngine",
    ],
  },
  {
    text: "Apa peran utama dari Mock Service Worker (MSW) dalam fase development aplikasi web?",
    correctIndex: 2,
    options: [
      "Membuat server database MySQL lokal secara virtual",
      "Mencegah siswa melakukan kecurangan (anti-cheat)",
      "Mengintersepsi HTTP request di tingkat browser dan menyajikan data mock tanpa real server",
      "Mengontrol resolusi grafik antarmuka pengguna",
    ],
  },
  {
    text: "Peristiwa 'force-submit' dari server CBT ke klien paling sering dipicu karena...",
    correctIndex: 1,
    options: [
      "Siswa menekan tombol kembali",
      "Waktu durasi ujian berakhir atau supervisor menutup sesi ujian secara manual",
      "Siswa menekan tombol flag ragu-ragu",
      "Koneksi internet terputus sementara",
    ],
  },
  {
    text: "Sikap mental apa yang paling utama untuk menghadapi tantangan pemrograman yang rumit?",
    correctIndex: 1,
    options: [
      "Langsung menyerah ketika terjadi error pertama kali",
      "Resiliensi: tekun mencoba kembali, membaca pesan log error, dan mencari solusi terbaik secara sistematis",
      "Menyalin kode dari internet tanpa memahaminya sama sekali",
      "Menyalahkan komputer atas segala masalah kompilasi",
    ],
  },
];

const englishQuestions: SeedQuestion[] = [
  {
    text: "Choose the correct verb: \"She ___ to school every day.\"",
    correctIndex: 2,
    options: ["go", "going", "goes", "gone"],
  },
  {
    text: "Complete the sentence in the past tense: \"Yesterday, they ___ a movie at the cinema.\"",
    correctIndex: 1,
    options: ["watch", "watched", "watching", "watches"],
  },
  {
    text: "Which word is the closest synonym of \"happy\"?",
    correctIndex: 0,
    options: ["joyful", "angry", "tired", "afraid"],
  },
  {
    text: "Choose the correct preposition: \"The book is ___ the table.\"",
    correctIndex: 1,
    options: ["in", "on", "at", "of"],
  },
  {
    text: "Pick the correct question form: \"___ you like a cup of coffee?\"",
    correctIndex: 0,
    options: ["Do", "Does", "Is", "Are"],
  },
  {
    text: "What is the correct plural form of the word \"child\"?",
    correctIndex: 2,
    options: ["childs", "childes", "children", "childrens"],
  },
  {
    text: "Choose the correct comparative form: \"This box is ___ than that one.\"",
    correctIndex: 1,
    options: ["heavy", "heavier", "heaviest", "more heavy"],
  },
  {
    text: "Complete the present perfect sentence: \"I ___ already finished my homework.\"",
    correctIndex: 3,
    options: ["has", "had", "am", "have"],
  },
  {
    text: "Which word is the antonym (opposite) of \"ancient\"?",
    correctIndex: 2,
    options: ["old", "historic", "modern", "antique"],
  },
  {
    text: "Choose the correct article: \"He is ___ honest man.\"",
    correctIndex: 1,
    options: ["a", "an", "the", "no article"],
  },
];

const seedExams: SeedExam[] = [
  {
    id: "exam_math_101",
    title: "Ujian Akhir Semester - Pemrograman & Logika Komputer",
    durationMinutes: 30,
    idPrefix: "",
    questions: programmingQuestions,
  },
  {
    id: "exam_english_101",
    title: "Ujian Bahasa Inggris - English Proficiency Test",
    durationMinutes: 30,
    idPrefix: "eng_",
    questions: englishQuestions,
  },
];

for (const exam of seedExams) {
  await db
    .insert(exams)
    .values({
      id: exam.id,
      title: exam.title,
      durationMinutes: exam.durationMinutes,
    })
    .onDuplicateKeyUpdate({ set: { title: exam.title } });
  log.info(`Exam upserted: ${exam.id}`);

  for (let qi = 0; qi < exam.questions.length; qi++) {
    const q = exam.questions[qi]!;
    const qId = `${exam.idPrefix}q_${qi + 1}`;
    const optionIds = q.options.map(
      (_, oi) =>
        `${exam.idPrefix}opt_${qi + 1}_${String.fromCharCode(97 + oi)}`
    );
    const correctOptionId = optionIds[q.correctIndex]!;

    await db
      .insert(questions)
      .values({
        id: qId,
        examId: exam.id,
        text: q.text,
        correctOptionId,
        orderIndex: qi,
      })
      .onDuplicateKeyUpdate({ set: { text: q.text, correctOptionId } });

    // Insert all options for this question in one batched upsert.
    await db
      .insert(options)
      .values(
        q.options.map((text, oi) => ({
          id: optionIds[oi]!,
          questionId: qId,
          text,
        }))
      )
      .onDuplicateKeyUpdate({ set: { text: sql`values(${options.text})` } });

    log.info(
      `[${exam.id}] Question ${qi + 1} upserted: ${q.text.slice(0, 50)}...`
    );
  }
}

log.info("Seeding complete. Initial data inserted.");
await pool.end();
