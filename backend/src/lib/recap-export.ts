/**
 * Azhura CBT Backend — Recap → Excel (.xlsx) export (#20)
 *
 * Turns the aggregate recap data (see `recap.ts`) into styled `.xlsx` workbooks
 * for the admin export endpoints. Built with `exceljs`. The workbooks contain a
 * title/stats header followed by a data table; the answer key is never included
 * (the recap data carries only derived scores/counts, by design).
 */

import ExcelJS from "exceljs";
import type { RecapSessionStatus } from "@azhura/shared";
import type { ExamRecapData, StudentRecapData } from "./recap";

/** Indonesian status labels (mirror the console badges). */
const STATUS_LABEL: Record<RecapSessionStatus, string> = {
  in_progress: "Mengerjakan",
  completed: "Selesai",
  expired: "Kedaluwarsa",
};

const DATE_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Epoch-ms → "12 Jun 2026, 14.30" (Indonesian locale). */
const formatDateTime = (epochMs: number): string => DATE_FMT.format(new Date(epochMs));

/** Dash for a not-yet-graded (in-progress) score. */
const scoreCell = (score: number | null): number | string => (score === null ? "—" : score);

/** Bold + filled styling for a header row. */
const styleHeaderRow = (row: ExcelJS.Row): void => {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFF2F7" },
    };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
};

/** Sets column widths from an array, 1-based. */
const setWidths = (ws: ExcelJS.Worksheet, widths: number[]): void => {
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
};

/**
 * Builds the per-exam recap workbook: a header (title + class stats) and one row
 * per participant. Returns the file as a Node Buffer.
 */
export const buildExamRecapWorkbook = async (
  data: ExamRecapData
): Promise<Buffer> => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Azhura CBT";
  wb.created = new Date();
  const ws = wb.addWorksheet("Rekap Ujian");

  const columns = [
    "No",
    "Nama",
    "NIS",
    "Group",
    "Status",
    "Skor",
    "Benar",
    "Salah",
    "Kosong",
    "Mulai",
    "Selesai",
  ];
  setWidths(ws, [5, 28, 14, 16, 14, 8, 8, 8, 9, 20, 20]);

  const { average, highest, lowest, completedCount, totalParticipants } = data.stats;
  ws.addRow([data.exam.title]);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.addRow([`Jumlah soal: ${data.exam.totalQuestions}`]);
  ws.addRow([
    `Peserta: ${totalParticipants}   Selesai: ${completedCount}   ` +
      `Rata-rata: ${average ?? "—"}   Tertinggi: ${highest ?? "—"}   Terendah: ${lowest ?? "—"}`,
  ]);
  ws.addRow([]);

  styleHeaderRow(ws.addRow(columns));

  data.participants.forEach((p, i) => {
    ws.addRow([
      i + 1,
      p.name,
      p.nis,
      p.groupName ?? "—",
      STATUS_LABEL[p.status],
      scoreCell(p.score),
      p.totalCorrect,
      p.totalWrong,
      p.totalEmpty,
      formatDateTime(p.startTime),
      formatDateTime(p.endTime),
    ]);
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
};

/**
 * Builds the per-student recap workbook: a header (student + summary stats) and
 * one row per exam taken. Returns the file as a Node Buffer.
 */
export const buildStudentRecapWorkbook = async (
  data: StudentRecapData
): Promise<Buffer> => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Azhura CBT";
  wb.created = new Date();
  const ws = wb.addWorksheet("Rekap Siswa");

  const columns = [
    "No",
    "Ujian",
    "Status",
    "Skor",
    "Benar",
    "Salah",
    "Kosong",
    "Mulai",
    "Selesai",
  ];
  setWidths(ws, [5, 32, 14, 8, 8, 8, 9, 20, 20]);

  const { examsTaken, completedCount, average } = data.stats;
  ws.addRow([`${data.student.name} (${data.student.nis})`]);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.addRow([`Group: ${data.student.groupName ?? "—"}`]);
  ws.addRow([
    `Ujian diikuti: ${examsTaken}   Selesai: ${completedCount}   Rata-rata: ${average ?? "—"}`,
  ]);
  ws.addRow([]);

  styleHeaderRow(ws.addRow(columns));

  data.history.forEach((h, i) => {
    ws.addRow([
      i + 1,
      h.examTitle,
      STATUS_LABEL[h.status],
      scoreCell(h.score),
      h.totalCorrect,
      h.totalWrong,
      h.totalEmpty,
      formatDateTime(h.startTime),
      formatDateTime(h.endTime),
    ]);
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
};

/** Slugifies a label for use in a download filename (ASCII, dash-separated). */
export const slugifyFilename = (label: string): string =>
  label
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60) || "rekap";
