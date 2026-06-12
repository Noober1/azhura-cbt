/**
 * Azhura CBT Backend — Supervisor Question Stem-Media Guard Tests
 *
 * Mirrors the admin stem-media guard tests for the supervisor CRUD routes
 * (`/api/supervisor/exams/:examId/questions`). A supervisor must be assigned to
 * the exam (row in `exam_supervisors`) to manage its questions.
 *
 * Coverage:
 * 1. Always-run auth-gating smoke test via `app.handle()` (no DB needed).
 * 2. DB-integration tests (skipped cleanly when the DB is unreachable):
 *    - create rejects an external stem image (400),
 *    - update (PUT) rejects an external stem image (400).
 * Fixtures use a throwaway `zzs_`/`zzst_` prefix and are purged in `afterAll`.
 */

// Import the db module first to break the db↔logger import cycle (see admin
// questions.test.ts for the rationale).
import "../db";

import { describe, it, expect, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { randomUUID } from "crypto";
import { eq, like } from "drizzle-orm";
import { getJwtSecret } from "../lib/env";
import { db, schema, assertDbConnection } from "../db";
import { supervisorQuestionRoutes } from "./supervisor-questions";

const { users, exams, examSupervisors } = schema;

const app = new Elysia().group("/api", (a) => a.use(supervisorQuestionRoutes));

// ── Token minting (identical secret/HS256 to what authPlugin verifies) ───────

const tokenSigner = new Elysia()
  .use(jwt({ name: "jwt", secret: getJwtSecret() }))
  .get("/__sign", ({ jwt, query }) =>
    jwt.sign({
      userId: query.userId ?? "u-test",
      nis: "00000",
      role: query.role ?? "supervisor",
      groupId: "",
    })
  );

async function signToken(role: string, userId = "u-test"): Promise<string> {
  const res = await tokenSigner.handle(
    new Request(`http://localhost/__sign?role=${role}&userId=${userId}`)
  );
  return res.text();
}

const IMG_LOCAL = "/uploads/images/zzs-stem.webp";
const IMG_EXTERNAL = "https://evil.example.com/track.gif";

const MC_OPTIONS = [{ text: "<p>A</p>" }, { text: "<p>B</p>" }];

// ── 1. Always-run auth-gating smoke test ─────────────────────────────────────

describe("POST /api/supervisor/exams/:examId/questions — auth gating", () => {
  it("returns 403 for a valid non-supervisor (student) token", async () => {
    const token = await signToken("student");
    const res = await app.handle(
      new Request("http://localhost/api/supervisor/exams/any/questions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: "<p>Soal?</p>",
          options: MC_OPTIONS,
          correctOptionIndex: 0,
        }),
      })
    );
    expect(res.status).toBe(403);
  });
});

// ── 2. DB-integration tests (skipped cleanly when DB is unreachable) ─────────

const TEST_NIS_PREFIX = "zzs_";
const TEST_EXAM_TITLE = "zzs_Ujian Supervisor Media";
const examId = randomUUID();
const seededSupervisorId = randomUUID();
let supervisorToken = "";

async function probeDb(): Promise<boolean> {
  try {
    await assertDbConnection();
    return true;
  } catch {
    return false;
  }
}

const dbReady = await probeDb();

if (dbReady) {
  supervisorToken = await signToken("supervisor", seededSupervisorId);

  // Clear any leftovers from a previously aborted run before seeding.
  await db.delete(users).where(like(users.nis, `${TEST_NIS_PREFIX}%`));
  await db.delete(exams).where(like(exams.title, `${TEST_NIS_PREFIX}%`));

  await db.insert(users).values({
    id: seededSupervisorId,
    nis: `${TEST_NIS_PREFIX}qsupervisor`,
    name: "ZZS Supervisor",
    password: "x",
    role: "supervisor",
    groupId: null,
    isActive: 1,
  });

  await db.insert(exams).values({
    id: examId,
    title: TEST_EXAM_TITLE,
    durationMinutes: 30,
    isActive: 1,
    randomizeQuestion: 0,
    randomizeAnswer: 0,
    expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  // Assign the supervisor to the exam so assertAssigned passes.
  await db.insert(examSupervisors).values({
    examId,
    userId: seededSupervisorId,
  });
}

afterAll(async () => {
  if (!dbReady) return;
  // Exam delete cascades questions, options, and supervisor assignments.
  await db.delete(exams).where(eq(exams.id, examId));
  await db.delete(users).where(like(users.nis, `${TEST_NIS_PREFIX}%`));
});

/** Sends an authenticated request and returns [status, parsed-body]. */
async function request(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<[number, any]> {
  const res = await app.handle(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  const text = await res.text();
  if (!text) return [res.status, null];
  try {
    return [res.status, JSON.parse(text)];
  } catch {
    return [res.status, text];
  }
}

describe("Supervisor stem media — must be local /uploads (DB integration)", () => {
  it.skipIf(!dbReady)(
    "accepts a stem embedding a local /uploads image (201)",
    async () => {
      const [status] = await request(
        supervisorToken,
        "POST",
        `/supervisor/exams/${examId}/questions`,
        {
          text: `<p>Perhatikan:</p><img src="${IMG_LOCAL}" alt="bagan">`,
          options: MC_OPTIONS,
          correctOptionIndex: 0,
        }
      );
      expect(status).toBe(201);
    }
  );

  it.skipIf(!dbReady)(
    "rejects creating a stem embedding an external image (400)",
    async () => {
      const [status] = await request(
        supervisorToken,
        "POST",
        `/supervisor/exams/${examId}/questions`,
        {
          text: `<p>x</p><img src="${IMG_EXTERNAL}">`,
          options: MC_OPTIONS,
          correctOptionIndex: 0,
        }
      );
      expect(status).toBe(400);
    }
  );

  it.skipIf(!dbReady)(
    "rejects updating a stem to an external image (400)",
    async () => {
      const [createStatus, created] = await request(
        supervisorToken,
        "POST",
        `/supervisor/exams/${examId}/questions`,
        {
          text: "<p>Soal awal bersih.</p>",
          options: MC_OPTIONS,
          correctOptionIndex: 0,
        }
      );
      expect(createStatus).toBe(201);

      const [status] = await request(
        supervisorToken,
        "PUT",
        `/supervisor/exams/${examId}/questions/${created.id}`,
        {
          text: `<p>diubah</p><img src="${IMG_EXTERNAL}">`,
          options: MC_OPTIONS,
          correctOptionIndex: 0,
        }
      );
      expect(status).toBe(400);
    }
  );
});
