/**
 * Azhura CBT Backend — Recap Excel export unit tests (#20)
 *
 * Builds workbooks from fixture recap data and reads them back with exceljs to
 * assert structure and cell values. Pure (in-memory) — no DB or HTTP, so it runs
 * under `bun test` without live credentials. The route wiring is covered by the
 * gating tests in `routes/admin/recap.test.ts`.
 */

import { describe, it, expect } from "bun:test";
import ExcelJS from "exceljs";
import {
  buildExamRecapWorkbook,
  buildStudentRecapWorkbook,
  slugifyFilename,
} from "./recap-export";
import type { ExamRecapData, StudentRecapData } from "./recap";

const examData: ExamRecapData = {
  exam: { id: "exam-1", title: "Ujian Matematika", totalQuestions: 3 },
  stats: {
    totalParticipants: 2,
    completedCount: 1,
    average: 67,
    highest: 67,
    lowest: 67,
  },
  participants: [
    {
      sessionId: "s1",
      userId: "u1",
      name: "Ahmad Faisal",
      nis: "12345",
      groupName: "Kelas 7A",
      status: "completed",
      score: 67,
      totalCorrect: 2,
      totalWrong: 1,
      totalEmpty: 0,
      startTime: 1_700_000_000_000,
      endTime: 1_700_000_600_000,
    },
    {
      sessionId: "s2",
      userId: "u2",
      name: "Budi Santoso",
      nis: "67890",
      groupName: null,
      status: "in_progress",
      score: null,
      totalCorrect: 1,
      totalWrong: 0,
      totalEmpty: 2,
      startTime: 1_700_000_100_000,
      endTime: 1_700_000_700_000,
    },
  ],
};

const studentData: StudentRecapData = {
  student: { id: "u1", name: "Ahmad Faisal", nis: "12345", groupName: "Kelas 7A" },
  stats: { examsTaken: 1, completedCount: 1, average: 67 },
  history: [
    {
      sessionId: "s1",
      examId: "exam-1",
      examTitle: "Ujian Matematika",
      status: "completed",
      score: 67,
      totalCorrect: 2,
      totalWrong: 1,
      totalEmpty: 0,
      startTime: 1_700_000_000_000,
      endTime: 1_700_000_600_000,
    },
  ],
};

async function readWorkbook(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // Pass an ArrayBuffer view to avoid the exceljs/node `Buffer` type mismatch.
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  await wb.xlsx.load(ab as ArrayBuffer);
  return wb;
}

describe("recap-export: buildExamRecapWorkbook", () => {
  it("produces a valid xlsx (PK zip signature)", async () => {
    const buf = await buildExamRecapWorkbook(examData);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("writes the title, header, and one row per participant", async () => {
    const wb = await readWorkbook(await buildExamRecapWorkbook(examData));
    const ws = wb.getWorksheet("Rekap Ujian");
    expect(ws).toBeDefined();
    expect(ws!.getCell("A1").value).toBe("Ujian Matematika");

    // Header row is row 5 (title, soal, stats, blank, header).
    expect(ws!.getRow(5).getCell(2).value).toBe("Nama");
    expect(ws!.getRow(5).getCell(6).value).toBe("Skor");

    // First data row.
    const first = ws!.getRow(6);
    expect(first.getCell(2).value).toBe("Ahmad Faisal");
    expect(first.getCell(3).value).toBe("12345");
    expect(first.getCell(5).value).toBe("Selesai");
    expect(first.getCell(6).value).toBe(67);
    expect(first.getCell(7).value).toBe(2);

    // In-progress participant shows a dash for score.
    const second = ws!.getRow(7);
    expect(second.getCell(4).value).toBe("—"); // no group
    expect(second.getCell(5).value).toBe("Mengerjakan");
    expect(second.getCell(6).value).toBe("—"); // no final score
  });
});

describe("recap-export: buildStudentRecapWorkbook", () => {
  it("writes the student header and exam history rows", async () => {
    const wb = await readWorkbook(await buildStudentRecapWorkbook(studentData));
    const ws = wb.getWorksheet("Rekap Siswa");
    expect(ws).toBeDefined();
    expect(ws!.getCell("A1").value).toBe("Ahmad Faisal (12345)");

    expect(ws!.getRow(5).getCell(2).value).toBe("Ujian");
    const first = ws!.getRow(6);
    expect(first.getCell(2).value).toBe("Ujian Matematika");
    expect(first.getCell(4).value).toBe(67);
  });
});

describe("recap-export: slugifyFilename", () => {
  it("lowercases and dash-separates", () => {
    expect(slugifyFilename("Ujian Matematika")).toBe("ujian-matematika");
  });

  it("strips punctuation/diacritics and clamps length", () => {
    expect(slugifyFilename("Ujian: Bahasa & Sastra!")).toBe("ujian-bahasa-sastra");
    expect(slugifyFilename("   ")).toBe("rekap");
  });
});
