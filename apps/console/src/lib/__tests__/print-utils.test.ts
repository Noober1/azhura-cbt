import { describe, expect, it } from "vitest";
import {
  buildExamRecapPrintHtml,
  buildStudentRecapPrintHtml,
  buildStudentCardsPrintHtml,
  type ExamPrintData,
  type StudentPrintData,
} from "../print-utils";
import type {
  RecapParticipant,
  StudentRecapEntry,
  StudentSummary,
} from "../../types";

// openPrintWindow() depends on Blob / window.open (browser-only) and is left to
// the E2E suite. These specs cover the pure HTML builders (Node-safe).

function participant(over: Partial<RecapParticipant> = {}): RecapParticipant {
  return {
    sessionId: "s-1",
    userId: "u-1",
    name: "Ahmad Faisal",
    nis: "12345",
    groupName: "Kelas 7A",
    status: "completed",
    score: 88,
    totalCorrect: 8,
    totalWrong: 1,
    totalEmpty: 1,
    startTime: new Date(2026, 5, 12, 8, 0, 0).getTime(),
    endTime: new Date(2026, 5, 12, 9, 0, 0).getTime(),
    ...over,
  };
}

function examData(over: Partial<ExamPrintData> = {}): ExamPrintData {
  return {
    exam: { id: "e-1", title: "Ujian Matematika", totalQuestions: 10 },
    stats: {
      totalParticipants: 1,
      completedCount: 1,
      average: 88,
      highest: 88,
      lowest: 88,
    },
    participants: [participant()],
    ...over,
  };
}

describe("buildExamRecapPrintHtml", () => {
  it("renders a full HTML document with the exam title and school name", () => {
    const html = buildExamRecapPrintHtml(examData(), "SMP Azhura");

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Ujian Matematika");
    expect(html).toContain("SMP Azhura");
  });

  it("includes one table row per participant", () => {
    const html = buildExamRecapPrintHtml(
      examData({ participants: [participant(), participant({ name: "Budi" })] }),
      "SMP Azhura",
    );
    const bodyRows = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    expect((bodyRows.match(/<tr>/g) ?? []).length).toBe(2);
  });

  it("renders the empty-state message when there are no participants", () => {
    const html = buildExamRecapPrintHtml(
      examData({ participants: [] }),
      "SMP Azhura",
    );
    expect(html).toContain("Tidak ada data peserta.");
    expect(html).not.toContain("<tbody>");
  });

  it("renders an em dash for a null score (in-progress session)", () => {
    const html = buildExamRecapPrintHtml(
      examData({
        participants: [participant({ status: "in_progress", score: null })],
      }),
      "SMP Azhura",
    );
    expect(html).toContain("Mengerjakan");
    expect(html).toContain("—");
  });

  it("escapes HTML-significant characters in participant names (XSS guard)", () => {
    const html = buildExamRecapPrintHtml(
      examData({ participants: [participant({ name: "<script>alert(1)</script>" })] }),
      "SMP Azhura",
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("maps each session status to its Indonesian label", () => {
    const html = buildExamRecapPrintHtml(
      examData({
        participants: [
          participant({ status: "completed" }),
          participant({ status: "in_progress", score: null }),
          participant({ status: "expired" }),
        ],
      }),
      "SMP Azhura",
    );
    expect(html).toContain("Selesai");
    expect(html).toContain("Mengerjakan");
    expect(html).toContain("Kedaluwarsa");
  });
});

function historyEntry(over: Partial<StudentRecapEntry> = {}): StudentRecapEntry {
  return {
    sessionId: "s-1",
    examId: "e-1",
    examTitle: "Ujian IPA",
    status: "completed",
    score: 75,
    totalCorrect: 7,
    totalWrong: 2,
    totalEmpty: 1,
    startTime: new Date(2026, 5, 10, 8, 0, 0).getTime(),
    endTime: new Date(2026, 5, 10, 9, 0, 0).getTime(),
    ...over,
  };
}

function studentData(over: Partial<StudentPrintData> = {}): StudentPrintData {
  return {
    student: { id: "u-1", name: "Citra Lestari", nis: "99999", groupName: "Kelas 8A" },
    stats: { examsTaken: 1, completedCount: 1, average: 75 },
    history: [historyEntry()],
    ...over,
  };
}

describe("buildStudentRecapPrintHtml", () => {
  it("renders the student name, NIS, and group", () => {
    const html = buildStudentRecapPrintHtml(studentData(), "SMP Azhura");
    expect(html).toContain("Citra Lestari");
    expect(html).toContain("99999");
    expect(html).toContain("Kelas 8A");
  });

  it("renders the empty-state message when the student has no history", () => {
    const html = buildStudentRecapPrintHtml(studentData({ history: [] }), "SMP Azhura");
    expect(html).toContain("Belum ada riwayat ujian.");
  });

  it("omits the group label when the student has no group", () => {
    const html = buildStudentRecapPrintHtml(
      studentData({
        student: { id: "u-1", name: "Citra Lestari", nis: "99999", groupName: null },
      }),
      "SMP Azhura",
    );
    expect(html).not.toContain("Group:");
  });

  it("includes one table row per history entry", () => {
    const html = buildStudentRecapPrintHtml(
      studentData({ history: [historyEntry(), historyEntry({ examTitle: "Ujian PKN" })] }),
      "SMP Azhura",
    );
    const bodyRows = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    expect((bodyRows.match(/<tr>/g) ?? []).length).toBe(2);
  });
});

function student(over: Partial<StudentSummary> = {}): StudentSummary {
  return {
    id: "u-1",
    nis: "12345",
    name: "Ahmad Faisal",
    initialPassword: "student@123",
    groupId: "g-1",
    groupName: "Kelas 7A",
    batch: 2026,
    isActive: true,
    createdAt: Date.now(),
    ...over,
  };
}

describe("buildStudentCardsPrintHtml", () => {
  it("renders one card per student with name and NIS", () => {
    const html = buildStudentCardsPrintHtml(
      [student(), student({ name: "Budi Santoso", nis: "67890" })],
      "SMP Azhura",
    );
    expect((html.match(/class="card"/g) ?? []).length).toBe(2);
    expect(html).toContain("Ahmad Faisal");
    expect(html).toContain("67890");
  });

  it("renders the password row when initialPassword is present", () => {
    const html = buildStudentCardsPrintHtml([student({ initialPassword: "secret123" })], "SMP Azhura");
    expect(html).toContain("Password");
    expect(html).toContain("secret123");
  });

  it("omits the password row when initialPassword is null", () => {
    const html = buildStudentCardsPrintHtml([student({ initialPassword: null })], "SMP Azhura");
    expect(html).not.toContain("Password");
  });

  it("renders the empty-state message when no students are selected", () => {
    const html = buildStudentCardsPrintHtml([], "SMP Azhura");
    expect(html).toContain("Tidak ada siswa yang dipilih.");
    expect(html).not.toContain('class="card"');
  });

  it("falls back to an em dash for a student without a group name", () => {
    const html = buildStudentCardsPrintHtml([student({ groupName: null })], "SMP Azhura");
    expect(html).toContain("—");
  });
});
