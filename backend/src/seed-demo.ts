/**
 * Azhura CBT Backend — Demo Seeder for the first-run simulation.
 *
 * Unlike the canonical {@link file://./seed.ts} (which also creates an admin and
 * a supervisor), this seeder provisions ONLY demo students, their groups, and a
 * sample exam — deliberately leaving the system without an admin so the console's
 * first-run Setup Wizard is triggered and the admin is created there.
 *
 * Shape: 4 students across 2 groups (2 each) + one exam linked to both groups,
 * so every seeded student can sit it. Idempotent upserts — safe to re-run. Run
 * with `bun run seed:demo` (requires migrations applied first).
 */

import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, pool, schema } from "./db";
import { createLogger } from "./lib/logger";
import {
  SETTINGS_DEFAULTS,
  SETTING_KEYS,
  serialize,
} from "./lib/settings-registry";
import type { SystemSettings } from "./lib/settings-registry";

const { users, groups, exams, examGroups, questions, options, settings } = schema;

const log = createLogger("SeedDemo");

const PASSWORD_HASH = await bcrypt.hash("student@123", 10);

// ── Groups (2) ───────────────────────────────────────────────────────────────
const seedGroups: { id: string; name: string }[] = [
  { id: "grp_7a", name: "Kelas 7A" },
  { id: "grp_7b", name: "Kelas 7B" },
];

for (const g of seedGroups) {
  await db
    .insert(groups)
    .values({ id: g.id, name: g.name })
    .onDuplicateKeyUpdate({ set: { name: g.name } });
  log.info(`Group upserted: ${g.name} (${g.id})`);
}

// ── Students (4, two per group) — no admin/supervisor here on purpose ─────────
const seedStudents: { id: string; nis: string; name: string; groupId: string }[] = [
  { id: "usr_d001", nis: "10001", name: "Andi Pratama",  groupId: "grp_7a" },
  { id: "usr_d002", nis: "10002", name: "Bunga Lestari", groupId: "grp_7a" },
  { id: "usr_d003", nis: "20001", name: "Citra Dewi",    groupId: "grp_7b" },
  { id: "usr_d004", nis: "20002", name: "Dimas Saputra", groupId: "grp_7b" },
];

for (const s of seedStudents) {
  await db
    .insert(users)
    .values({
      id: s.id,
      nis: s.nis,
      password: PASSWORD_HASH,
      name: s.name,
      role: "student",
      groupId: s.groupId,
    })
    .onDuplicateKeyUpdate({ set: { name: s.name, groupId: s.groupId } });
  log.info(`Student upserted: ${s.name} (${s.nis}) → ${s.groupId}`);
}

// ── Exam + questions/options, linked to both groups ──────────────────────────
interface SeedQuestion {
  text: string;
  correctIndex: number;
  options: string[];
}

const demoQuestions: SeedQuestion[] = [
  {
    text: "Ibu kota Indonesia adalah...",
    correctIndex: 2,
    options: ["Bandung", "Surabaya", "Jakarta", "Medan"],
  },
  {
    text: "Hasil dari 7 × 8 adalah...",
    correctIndex: 1,
    options: ["54", "56", "62", "48"],
  },
  {
    text: "Planet terdekat dengan Matahari adalah...",
    correctIndex: 0,
    options: ["Merkurius", "Venus", "Bumi", "Mars"],
  },
  {
    text: "Lawan kata dari \"besar\" adalah...",
    correctIndex: 3,
    options: ["luas", "tinggi", "lebar", "kecil"],
  },
  {
    text: "Air mendidih pada suhu (pada tekanan normal)...",
    correctIndex: 1,
    options: ["50°C", "100°C", "150°C", "200°C"],
  },
];

const DEMO_EXAM_ID = "exam_demo_umum";
const DEMO_EXAM_GROUPS = ["grp_7a", "grp_7b"];

await db
  .insert(exams)
  .values({
    id: DEMO_EXAM_ID,
    title: "Ujian Demo - Pengetahuan Umum",
    durationMinutes: 30,
  })
  .onDuplicateKeyUpdate({ set: { title: "Ujian Demo - Pengetahuan Umum" } });
log.info(`Exam upserted: ${DEMO_EXAM_ID}`);

await db
  .insert(examGroups)
  .values(DEMO_EXAM_GROUPS.map((groupId) => ({ examId: DEMO_EXAM_ID, groupId })))
  .onDuplicateKeyUpdate({ set: { examId: sql`values(${examGroups.examId})` } });
log.info(`Exam linked to groups: ${DEMO_EXAM_GROUPS.join(", ")}`);

for (let qi = 0; qi < demoQuestions.length; qi++) {
  const q = demoQuestions[qi]!;
  const qId = `demo_q_${qi + 1}`;
  const optionIds = q.options.map(
    (_, oi) => `demo_opt_${qi + 1}_${String.fromCharCode(97 + oi)}`
  );
  const correctOptionId = optionIds[q.correctIndex]!;

  await db
    .insert(questions)
    .values({ id: qId, examId: DEMO_EXAM_ID, text: q.text, correctOptionId, orderIndex: qi })
    .onDuplicateKeyUpdate({ set: { text: q.text, correctOptionId } });

  await db
    .insert(options)
    .values(q.options.map((text, oi) => ({ id: optionIds[oi]!, questionId: qId, text })))
    .onDuplicateKeyUpdate({ set: { text: sql`values(${options.text})` } });

  log.info(`[${DEMO_EXAM_ID}] Question ${qi + 1} upserted`);
}

// ── Settings (defaults only; never overwrite admin-configured values) ─────────
const now = Date.now();
for (const key of SETTING_KEYS) {
  const typedKey = key as keyof SystemSettings;
  const value = serialize(typedKey, SETTINGS_DEFAULTS[typedKey]);
  await db
    .insert(settings)
    .values({ key, value, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { key: sql`values(${settings.key})` } });
}
log.info("Default settings seeded.");

log.info("Demo seeding complete: 4 students, 2 groups, 1 exam, no admin (use the Setup Wizard).");
await pool.end();
