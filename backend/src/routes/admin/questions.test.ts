/**
 * Azhura CBT Backend — Question Option Image Route Tests (#163)
 *
 * Verifies the option `imageUrl` field end-to-end across the admin CRUD and
 * the student-facing questions endpoint:
 * 1. Always-run auth-gating smoke tests via `app.handle()` (no DB needed).
 * 2. DB-integration tests (skipped cleanly when the DB is unreachable):
 *    - create stores per-option `imageUrl` and echoes it back,
 *    - list/update round-trip the image (set, move, clear),
 *    - the student endpoint includes `imageUrl` but NEVER leaks the answer key
 *      (`correctOptionId`/`correctAnswerId`) on questions or options.
 * Fixtures use a throwaway `zzt_` prefix and are purged in `afterAll`.
 */

// Import the db module first to break the db↔logger import cycle: `db/index.ts`
// instantiates a logger at module load, and importing a route (which pulls in
// the logger module) before `../../db` triggers a `createLogger` TDZ error.
import "../../db";

import { describe, it, expect, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { randomUUID } from "crypto";
import { eq, like } from "drizzle-orm";
import { getJwtSecret } from "../../lib/env";
import { db, schema, assertDbConnection } from "../../db";
import { adminQuestionRoutes } from "./questions";
import { examRoutes } from "../exam";

const { users, exams, examSessions } = schema;

const app = new Elysia().group("/api", (a) =>
  a.use(adminQuestionRoutes).use(examRoutes)
);

// ── Token minting (identical secret/HS256 to what authPlugin verifies) ───────

const tokenSigner = new Elysia()
  .use(jwt({ name: "jwt", secret: getJwtSecret() }))
  .get("/__sign", ({ jwt, query }) =>
    jwt.sign({
      userId: query.userId ?? "u-test",
      nis: "00000",
      role: query.role ?? "admin",
      groupId: "",
    })
  );

async function signToken(role: string, userId = "u-test"): Promise<string> {
  const res = await tokenSigner.handle(
    new Request(`http://localhost/__sign?role=${role}&userId=${userId}`)
  );
  return res.text();
}

const IMG_A = "/uploads/images/zzt-option-a.jpg";
const IMG_B = "/uploads/images/zzt-option-b.png";

// ── 1. Always-run auth-gating smoke tests ────────────────────────────────────

describe("POST /api/admin/exams/:examId/questions — auth gating", () => {
  const url = "http://localhost/api/admin/exams/any-exam/questions";
  const payload = {
    text: "<p>Soal?</p>",
    options: [{ text: "<p>A</p>", imageUrl: IMG_A }, { text: "<p>B</p>" }],
    correctOptionIndex: 0,
  };

  it("returns 401 when no Authorization header is present", async () => {
    const res = await app.handle(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a valid non-admin (student) token", async () => {
    const token = await signToken("student");
    const res = await app.handle(
      new Request(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
    );
    expect(res.status).toBe(403);
  });
});

// ── 2. DB-integration tests (skipped cleanly when DB is unreachable) ─────────

const TEST_NIS_PREFIX = "zzt_";
const TEST_EXAM_TITLE = "zzt_Ujian Gambar Opsi";
const examId = randomUUID();
const seededAdminId = randomUUID();
const seededStudentId = randomUUID();
let adminToken = "";
let studentToken = "";

/**
 * Probe DB readiness at module load (top-level await) so the value is known
 * BEFORE `it.skipIf(...)` is evaluated — Bun reads the skip condition eagerly at
 * test-collection time, so a flag set in `beforeAll` would always read `false`.
 */
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
  adminToken = await signToken("admin", seededAdminId);
  studentToken = await signToken("student", seededStudentId);

  // Clear any leftovers from a previously aborted run before seeding.
  await db.delete(users).where(like(users.nis, `${TEST_NIS_PREFIX}%`));
  await db.delete(exams).where(like(exams.title, `${TEST_NIS_PREFIX}%`));

  await db.insert(users).values([
    {
      id: seededAdminId,
      nis: `${TEST_NIS_PREFIX}qadmin`,
      name: "ZZT Admin",
      password: "x",
      role: "admin",
      groupId: null,
      isActive: 1,
    },
    {
      id: seededStudentId,
      nis: `${TEST_NIS_PREFIX}qstudent`,
      name: "ZZT Student",
      password: "x",
      role: "student",
      groupId: null,
      isActive: 1,
    },
  ]);

  // randomizeAnswer = 0 keeps the student option order deterministic for asserts.
  await db.insert(exams).values({
    id: examId,
    title: TEST_EXAM_TITLE,
    durationMinutes: 30,
    isActive: 1,
    randomizeQuestion: 0,
    randomizeAnswer: 0,
    expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  // The student-facing questions endpoint now requires the student to hold a
  // session for the exam (access control). Seed one so the payload-shape
  // assertions below can reach the endpoint. It is intentionally EXPIRED
  // (endTime in the past): the questions authz only checks the session exists
  // and is unsubmitted, while the admin question-CRUD guard treats only a
  // still-running session as "active" — so this satisfies the read endpoint
  // without blocking the CRUD tests that also run on this exam.
  await db.insert(examSessions).values({
    id: randomUUID(),
    examId,
    userId: seededStudentId,
    startTime: Date.now() - 60 * 60 * 1000,
    endTime: Date.now() - 30 * 60 * 1000,
  });
}

afterAll(async () => {
  if (!dbReady) return;
  // Sessions first — `exam_sessions.exam_id` has no ON DELETE cascade, so the
  // exam delete would otherwise fail its FK. Exam delete then cascades
  // questions + options; finally purge fixture users.
  await db.delete(examSessions).where(eq(examSessions.examId, examId));
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

describe("Option imageUrl — admin CRUD round-trip (DB integration)", () => {
  let questionId = "";

  it.skipIf(!dbReady)("creates an MC question storing per-option imageUrl (201)", async () => {
    const [status, body] = await request(
      adminToken,
      "POST",
      `/admin/exams/${examId}/questions`,
      {
        text: "<p>Pilih gambar yang benar.</p>",
        options: [
          { text: "<p>Opsi A</p>", imageUrl: IMG_A },
          { text: "<p>Opsi B</p>" },
        ],
        correctOptionIndex: 0,
      }
    );
    expect(status).toBe(201);
    expect(body.options).toHaveLength(2);
    expect(body.options[0].imageUrl).toBe(IMG_A);
    expect(body.options[1].imageUrl).toBeNull();
    expect(typeof body.id).toBe("string");
    questionId = body.id;
  });

  it.skipIf(!dbReady)(
    "rejects an external imageUrl that is not an /uploads path (422)",
    async () => {
      const [status] = await request(
        adminToken,
        "POST",
        `/admin/exams/${examId}/questions`,
        {
          text: "<p>Soal jahat.</p>",
          options: [
            { text: "<p>A</p>", imageUrl: "https://evil.example.com/track.gif" },
            { text: "<p>B</p>" },
          ],
          correctOptionIndex: 0,
        }
      );
      expect(status).toBe(422);
    }
  );

  it.skipIf(!dbReady)("lists questions with the stored imageUrl", async () => {
    const [status, body] = await request(
      adminToken,
      "GET",
      `/admin/exams/${examId}/questions`
    );
    expect(status).toBe(200);
    const q = body.find((row: { id: string }) => row.id === questionId);
    expect(q).toBeDefined();
    expect(q.options[0].imageUrl).toBe(IMG_A);
    expect(q.options[1].imageUrl).toBeNull();
    // The admin view legitimately includes the answer key.
    expect(q.correctOptionId).toBe(q.options[0].id);
  });

  it.skipIf(!dbReady)("updates options: moves the image and clears the original", async () => {
    const [status, body] = await request(
      adminToken,
      "PATCH",
      `/admin/exams/${examId}/questions/${questionId}`,
      {
        options: [
          { text: "<p>Opsi A</p>", imageUrl: null },
          { text: "<p>Opsi B</p>", imageUrl: IMG_B },
        ],
        correctOptionIndex: 1,
      }
    );
    expect(status).toBe(200);
    expect(body.options[0].imageUrl).toBeNull();
    expect(body.options[1].imageUrl).toBe(IMG_B);
    expect(body.correctOptionId).toBe(body.options[1].id);
  });

  it.skipIf(!dbReady)(
    "student questions endpoint includes imageUrl but never the answer key",
    async () => {
      const [status, body] = await request(
        studentToken,
        "GET",
        `/exams/${examId}/questions`
      );
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      const q = body.find((row: { id: string }) => row.id === questionId);
      expect(q).toBeDefined();

      // The image flows through to students…
      expect(q.options).toHaveLength(2);
      expect(q.options[0].imageUrl).toBeNull();
      expect(q.options[1].imageUrl).toBe(IMG_B);

      // …but the answer key must NOT, in any spelling, on any level.
      expect(q).not.toHaveProperty("correctOptionId");
      expect(q).not.toHaveProperty("correctAnswerId");
      for (const opt of q.options) {
        expect(opt).not.toHaveProperty("correctOptionId");
        expect(opt).not.toHaveProperty("correctAnswerId");
        expect(opt).not.toHaveProperty("isCorrect");
      }
    }
  );
});

describe("Stem media — must be local /uploads (DB integration)", () => {
  it.skipIf(!dbReady)("accepts a stem embedding a local /uploads image (201)", async () => {
    const [status] = await request(
      adminToken,
      "POST",
      `/admin/exams/${examId}/questions`,
      {
        text: `<p>Perhatikan:</p><img src="${IMG_A}" alt="bagan">`,
        options: [{ text: "<p>A</p>" }, { text: "<p>B</p>" }],
        correctOptionIndex: 0,
      }
    );
    expect(status).toBe(201);
  });

  it.skipIf(!dbReady)(
    "rejects a stem embedding an external image (400)",
    async () => {
      const [status] = await request(
        adminToken,
        "POST",
        `/admin/exams/${examId}/questions`,
        {
          text: '<p>x</p><img src="https://evil.example.com/track.gif">',
          options: [{ text: "<p>A</p>" }, { text: "<p>B</p>" }],
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
        adminToken,
        "POST",
        `/admin/exams/${examId}/questions`,
        {
          text: "<p>Soal awal bersih.</p>",
          options: [{ text: "<p>A</p>" }, { text: "<p>B</p>" }],
          correctOptionIndex: 0,
        }
      );
      expect(createStatus).toBe(201);

      const [status] = await request(
        adminToken,
        "PATCH",
        `/admin/exams/${examId}/questions/${created.id}`,
        { text: '<p>diubah</p><img src="https://evil.example.com/x.png">' }
      );
      expect(status).toBe(400);
    }
  );
});
