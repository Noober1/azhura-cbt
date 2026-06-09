/**
 * Azhura CBT Console — Print utilities (#21, #22).
 *
 * Generates print-ready HTML for rekap nilai (per-paket, per-siswa) and
 * kartu peserta, then opens the HTML as a blob URL in a new window so the
 * browser's native print/Save-as-PDF dialog handles the output.
 *
 * No PDF library is required — browsers natively produce high-quality PDFs
 * via the print dialog, which is consistent with the old cardPrint/print_form
 * behaviour the issues reference.
 */

import type {
  RecapParticipant,
  RecapSessionStatus,
  ExamRecapStats,
  StudentRecapEntry,
  StudentRecapStats,
  StudentSummary,
} from "../types";

// ── Types passed to each builder ─────────────────────────────────────────────

export interface ExamPrintData {
  exam: { id: string; title: string; totalQuestions: number };
  stats: ExamRecapStats;
  participants: RecapParticipant[];
}

export interface StudentPrintData {
  student: { id: string; name: string; nis: string; groupName: string | null };
  stats: StudentRecapStats;
  history: StudentRecapEntry[];
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const DATE_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_SHORT = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const fmt = (epochMs: number) => DATE_FMT.format(new Date(epochMs));
const fmtShort = (epochMs: number) => DATE_SHORT.format(new Date(epochMs));

const STATUS_LABEL: Record<RecapSessionStatus, string> = {
  in_progress: "Mengerjakan",
  completed: "Selesai",
  expired: "Kedaluwarsa",
};

const score = (s: number | null) => (s === null ? "—" : String(s));
const num = (n: number | null) => (n === null ? "—" : String(n));

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Shared CSS ────────────────────────────────────────────────────────────────

const BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html { font-size: 10pt; }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: #111;
    background: #fff;
    margin: 0;
    padding: 12mm 14mm 12mm;
  }
  h1 { font-size: 14pt; font-weight: 700; margin: 0 0 2px; }
  h2 { font-size: 11pt; font-weight: 600; margin: 0 0 2px; }
  .meta { font-size: 8.5pt; color: #555; margin: 0; }
  .divider { border: none; border-top: 1.5px solid #e0e0e0; margin: 8px 0; }
  .stats-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
  .stat-box {
    background: #f5f6fa;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 5px 10px;
    min-width: 90px;
  }
  .stat-label { font-size: 7.5pt; color: #666; display: block; }
  .stat-value { font-size: 11pt; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  thead th {
    background: #f0f2f8;
    text-align: left;
    padding: 5px 7px;
    font-size: 8pt;
    font-weight: 600;
    border-bottom: 1.5px solid #c8cdd8;
    white-space: nowrap;
  }
  tbody td {
    padding: 4px 7px;
    font-size: 8.5pt;
    border-bottom: 1px solid #eee;
    vertical-align: middle;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:nth-child(even) td { background: #fafbff; }
  .num { text-align: right; }
  .center { text-align: center; }
  .tabular { font-variant-numeric: tabular-nums; }
  .badge-ok    { color: #16a34a; font-weight: 600; }
  .badge-prog  { color: #ca8a04; font-weight: 600; }
  .badge-exp   { color: #b91c1c; font-weight: 600; }
  .score-bold  { font-weight: 700; }
  .score-sub   { font-size: 7.5pt; color: #666; }
  .footer { margin-top: 10px; font-size: 7.5pt; color: #888; text-align: right; }

  @media print {
    body { padding: 0; }
    @page { margin: 12mm 14mm; size: A4 landscape; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
  }
`;

/**
 * ISO 7810 ID-1 card layout: 85.6 mm × 54 mm (credit-card size).
 * Two cards per row on A4 portrait (210 mm wide, 10 mm side margins → 190 mm usable;
 * 2 × 85.6 = 171.2 mm leaves ~18.8 mm column gap).
 * Four rows per page (4 × 54 + 3 × 5 mm gap = 231 mm < 277 mm usable height).
 */
const CARD_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html { font-size: 8pt; }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: #111;
    background: #fff;
    margin: 0;
    padding: 10mm 10mm;
  }
  h1.page-title { font-size: 11pt; font-weight: 700; margin: 0 0 4px; }
  .meta { font-size: 8pt; color: #555; margin: 0 0 8px; }

  /* Grid: 2 exact-size columns, auto rows */
  .cards-grid {
    display: grid;
    grid-template-columns: repeat(2, 85.6mm);
    justify-content: space-between;
    row-gap: 5mm;
  }

  /* Card fixed to ISO 7810 ID-1 dimensions */
  .card {
    width: 85.6mm;
    height: 54mm;
    border: 1.5px solid #bbb;
    border-radius: 3px;
    padding: 3mm 4mm;
    break-inside: avoid;
    page-break-inside: avoid;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Header row: school on left, "KARTU PESERTA" badge on right */
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2mm;
  }
  .card-school {
    font-size: 6.5pt;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    line-height: 1.2;
    max-width: 55mm;
  }
  .card-badge {
    font-size: 5.5pt;
    font-weight: 700;
    color: #fff;
    background: #1e40af;
    border-radius: 2px;
    padding: 1px 4px;
    white-space: nowrap;
    letter-spacing: 0.2px;
  }

  /* Student name */
  .card-name {
    font-size: 10.5pt;
    font-weight: 700;
    line-height: 1.2;
    margin-bottom: 1.5mm;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-divider { border: none; border-top: 1px solid #ddd; margin: 1.5mm 0; }

  /* Credential section */
  .card-cred-label {
    font-size: 5.5pt;
    font-weight: 700;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 1mm;
  }
  .card-cred-row {
    display: flex;
    align-items: baseline;
    gap: 2mm;
    margin-bottom: 1mm;
  }
  .card-cred-key {
    font-size: 7pt;
    color: #555;
    min-width: 18mm;
  }
  .card-cred-val {
    font-size: 8pt;
    font-weight: 700;
    font-family: 'Courier New', monospace;
    letter-spacing: 0.3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Footer: group + batch */
  .card-footer {
    margin-top: auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 1mm;
    border-top: 1px solid #eee;
  }
  .card-footer-item {
    font-size: 7pt;
    color: #444;
  }
  .card-footer-item strong { font-weight: 700; }

  @media print {
    body { padding: 0; }
    @page { margin: 10mm 10mm; size: A4 portrait; }
    .card { break-inside: avoid; page-break-inside: avoid; }
  }
`;

// ── Window opener ─────────────────────────────────────────────────────────────

/**
 * Opens an HTML string in a new window using a blob URL.
 * Returns false when the browser's popup blocker prevents the window from opening.
 * Callers should show a user-visible error in that case.
 */
export function openPrintWindow(html: string): boolean {
  const blob = new Blob([html], { type: "text/html; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
    return true;
  }
  // Popup was blocked — keep blob alive briefly so the user can manually open it,
  // then revoke to avoid leaking memory.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return false;
}

// ── HTML builders ─────────────────────────────────────────────────────────────

function statusClass(s: RecapSessionStatus): string {
  if (s === "completed") return "badge-ok";
  if (s === "in_progress") return "badge-prog";
  return "badge-exp";
}

function wrap(title: string, css: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <style>${css}</style>
</head>
<body>
${body}
<script>window.addEventListener('load', function() { window.print(); });<\/script>
</body>
</html>`;
}

/**
 * Builds print HTML for a per-exam recap (#21).
 *
 * @param data     - Complete (un-paginated) exam recap data.
 * @param schoolName - Institution name from system settings.
 */
export function buildExamRecapPrintHtml(
  data: ExamPrintData,
  schoolName: string
): string {
  const { exam, stats, participants } = data;
  const now = Date.now();

  const rows = participants
    .map(
      (p, i) => `
      <tr>
        <td class="center tabular">${i + 1}</td>
        <td>${esc(p.name)}</td>
        <td class="tabular">${esc(p.nis)}</td>
        <td>${esc(p.groupName ?? "—")}</td>
        <td class="${statusClass(p.status)}">${STATUS_LABEL[p.status]}</td>
        <td class="num score-bold tabular">${score(p.score)}</td>
        <td class="num tabular">${p.totalCorrect}</td>
        <td class="num tabular">${p.totalWrong}</td>
        <td class="num tabular">${p.totalEmpty}</td>
        <td class="tabular">${fmt(p.startTime)}</td>
      </tr>`
    )
    .join("");

  const body = `
  <h1>${esc(exam.title)}</h1>
  <p class="meta">${esc(schoolName)} &mdash; Dicetak ${fmtShort(now)} &mdash; ${participants.length} peserta &mdash; ${exam.totalQuestions} soal</p>
  <hr class="divider">
  <div class="stats-row">
    <div class="stat-box">
      <span class="stat-label">Rata-rata</span>
      <span class="stat-value">${num(stats.average)}</span>
    </div>
    <div class="stat-box">
      <span class="stat-label">Tertinggi</span>
      <span class="stat-value">${num(stats.highest)}</span>
    </div>
    <div class="stat-box">
      <span class="stat-label">Terendah</span>
      <span class="stat-value">${num(stats.lowest)}</span>
    </div>
    <div class="stat-box">
      <span class="stat-label">Selesai</span>
      <span class="stat-value">${stats.completedCount} / ${stats.totalParticipants}</span>
    </div>
  </div>
  ${
    participants.length === 0
      ? "<p>Tidak ada data peserta.</p>"
      : `
  <table>
    <thead>
      <tr>
        <th class="center">No</th>
        <th>Nama</th>
        <th>NIS</th>
        <th>Group</th>
        <th>Status</th>
        <th class="num">Skor</th>
        <th class="num">Benar</th>
        <th class="num">Salah</th>
        <th class="num">Kosong</th>
        <th>Mulai</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`
  }
  <p class="footer">Azhura CBT &mdash; ${esc(schoolName)}</p>`;

  return wrap(`Rekap Ujian — ${exam.title}`, BASE_CSS, body);
}

/**
 * Builds print HTML for a per-student recap (#21).
 *
 * @param data     - Complete (un-paginated) student recap data.
 * @param schoolName - Institution name from system settings.
 */
export function buildStudentRecapPrintHtml(
  data: StudentPrintData,
  schoolName: string
): string {
  const { student, stats, history } = data;
  const now = Date.now();

  const rows = history
    .map(
      (h, i) => `
      <tr>
        <td class="center tabular">${i + 1}</td>
        <td>${esc(h.examTitle)}</td>
        <td class="${statusClass(h.status)}">${STATUS_LABEL[h.status]}</td>
        <td class="num score-bold tabular">${score(h.score)}</td>
        <td class="num tabular">${h.totalCorrect}</td>
        <td class="num tabular">${h.totalWrong}</td>
        <td class="num tabular">${h.totalEmpty}</td>
        <td class="tabular">${fmt(h.startTime)}</td>
      </tr>`
    )
    .join("");

  const body = `
  <h1>${esc(student.name)}</h1>
  <p class="meta">NIS: ${esc(student.nis)}${student.groupName ? ` &mdash; Group: ${esc(student.groupName)}` : ""} &mdash; Dicetak ${fmtShort(now)}</p>
  <hr class="divider">
  <div class="stats-row">
    <div class="stat-box">
      <span class="stat-label">Ujian diikuti</span>
      <span class="stat-value">${stats.examsTaken}</span>
    </div>
    <div class="stat-box">
      <span class="stat-label">Selesai</span>
      <span class="stat-value">${stats.completedCount}</span>
    </div>
    <div class="stat-box">
      <span class="stat-label">Rata-rata</span>
      <span class="stat-value">${num(stats.average)}</span>
    </div>
  </div>
  ${
    history.length === 0
      ? "<p>Belum ada riwayat ujian.</p>"
      : `
  <table>
    <thead>
      <tr>
        <th class="center">No</th>
        <th>Ujian</th>
        <th>Status</th>
        <th class="num">Skor</th>
        <th class="num">Benar</th>
        <th class="num">Salah</th>
        <th class="num">Kosong</th>
        <th>Mulai</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`
  }
  <p class="footer">Azhura CBT &mdash; ${esc(schoolName)}</p>`;

  return wrap(`Rekap Siswa — ${student.name}`, BASE_CSS, body);
}

/**
 * Builds print HTML for batch student cards (#22).
 *
 * Each card is sized to ISO 7810 ID-1 (85.6 mm × 54 mm).
 * Each card shows: school name, student name, username (NIS), password
 * (from `student.initialPassword` — set by admin at creation/import), group, and batch.
 *
 * @param students   - The students to print cards for.
 * @param schoolName - Institution name shown on each card.
 */
export function buildStudentCardsPrintHtml(
  students: StudentSummary[],
  schoolName: string
): string {
  const now = Date.now();

  const cards = students
    .map(
      (s) => `
      <div class="card">
        <div class="card-header">
          <div class="card-school">${esc(schoolName)}</div>
          <div class="card-badge">KARTU PESERTA</div>
        </div>
        <div class="card-name">${esc(s.name)}</div>
        <hr class="card-divider">
        <div class="card-cred-label">Login CBT</div>
        <div class="card-cred-row">
          <span class="card-cred-key">Username</span>
          <span class="card-cred-val">${esc(s.nis)}</span>
        </div>
        ${s.initialPassword ? `
        <div class="card-cred-row">
          <span class="card-cred-key">Password</span>
          <span class="card-cred-val">${esc(s.initialPassword)}</span>
        </div>` : ""}
        <div class="card-footer">
          <span class="card-footer-item">Group: <strong>${esc(s.groupName ?? "—")}</strong></span>
          <span class="card-footer-item">Batch: <strong>${s.batch}</strong></span>
        </div>
      </div>`
    )
    .join("");

  const body = `
  <h1 class="page-title">Kartu Peserta Ujian</h1>
  <p class="meta">${esc(schoolName)} &mdash; ${students.length} siswa &mdash; Dicetak ${fmtShort(now)}</p>
  ${students.length === 0 ? "<p>Tidak ada siswa yang dipilih.</p>" : `<div class="cards-grid">${cards}</div>`}`;

  return wrap("Kartu Peserta Ujian", CARD_CSS, body);
}
