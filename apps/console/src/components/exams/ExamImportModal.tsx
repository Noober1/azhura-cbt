/**
 * Azhura CBT Console — Exam import modal (#82).
 *
 * Multi-state flow:
 *  idle       → drag-drop zone + template download
 *  loading    → dry-run in progress
 *  preview    → show row results; confirm or cancel
 *  confirming → executing bulk insert
 *  done       → show result + toast notification
 */

import { useRef, useState } from "react";
import { examsImportApi } from "../../lib/exams-import-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { formatDateTime } from "../../lib/format";
import type { ExamImportPreview, ExamImportConfirmResult } from "../../types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Spinner } from "../ui/Spinner";
import { UploadIcon, DownloadIcon, FileTextIcon } from "../ui/icons";

type Step = "idle" | "loading" | "preview" | "confirming" | "done";
type RowFilter = "all" | "ready" | "skip" | "error";

interface ExamImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function ExamImportModal({ open, onClose, onImported }: ExamImportModalProps) {
  const [step, setStep] = useState<Step>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<ExamImportPreview | null>(null);
  const [result, setResult] = useState<ExamImportConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("idle");
    setPreview(null);
    setResult(null);
    setError(null);
    setDragOver(false);
    setRowFilter("all");
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function runDryRun(file: File) {
    if (!file.name.match(/\.(xlsx|csv)$/i)) {
      setError("Format tidak didukung. Gunakan file .xlsx atau .csv.");
      return;
    }
    setError(null);
    setStep("loading");
    try {
      const data = await examsImportApi.dryRun(file);
      setPreview(data);
      setStep("preview");
    } catch (err) {
      setError(getErrorMessage(err, "Gagal memproses file."));
      setStep("idle");
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    void runDryRun(files[0]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  async function handleConfirm() {
    if (!preview) return;
    setStep("confirming");
    try {
      const res = await examsImportApi.confirm(preview.sessionToken);
      setResult(res);
      setStep("done");
      onImported();
      const parts: string[] = [];
      if (res.inserted > 0) parts.push(`${res.inserted} ujian ditambahkan`);
      if (res.skipped > 0) parts.push(`${res.skipped} dilewati (sudah ada)`);
      toast.success(`Import selesai: ${parts.join(", ") || "tidak ada perubahan"}.`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal mengeksekusi import."));
      setStep("preview");
    }
  }

  const totalRows = preview
    ? preview.summary.ready + preview.summary.skip + preview.summary.error
    : 0;

  const filteredRows = preview
    ? preview.rows.filter((r) => {
        if (rowFilter === "ready") return r.status === "ready";
        if (rowFilter === "skip") return r.status === "skip";
        if (rowFilter === "error") return r.status === "error";
        return true;
      })
    : [];

  return (
    <Modal
      open={open}
      title="Import Ujian dari Spreadsheet"
      description="Upload file .xlsx atau .csv dengan kolom: judul, durasi_menit, passing_grade, token (opsional), expired_at (YYYY-MM-DD HH:mm)"
      onClose={handleClose}
      size="lg"
      footer={
        step === "idle" ? (
          <Button variant="secondary" onClick={handleClose}>
            Tutup
          </Button>
        ) : step === "preview" ? (
          <>
            <Button variant="secondary" onClick={reset}>
              Ganti File
            </Button>
            {preview && preview.summary.ready > 0 && (
              <Button onClick={handleConfirm}>
                Import {preview.summary.ready} Ujian
              </Button>
            )}
          </>
        ) : step === "done" ? (
          <Button onClick={handleClose}>Selesai</Button>
        ) : null
      }
    >
      {step === "idle" && (
        <div className="space-y-4">
          {error && (
            <p className="rounded-md border border-danger-wash bg-danger-wash/50 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          {/* Template download */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-faint">Download template:</span>
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<DownloadIcon className="size-4" />}
              onClick={() =>
                examsImportApi
                  .downloadTemplate("xlsx")
                  .catch(() => toast.error("Gagal mengunduh template."))
              }
            >
              .xlsx
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<DownloadIcon className="size-4" />}
              onClick={() =>
                examsImportApi
                  .downloadTemplate("csv")
                  .catch(() => toast.error("Gagal mengunduh template."))
              }
            >
              .csv
            </Button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragOver
                ? "border-accent bg-accent/5"
                : "border-line hover:border-faint hover:bg-canvas/60"
            }`}
          >
            <span className="grid size-12 place-items-center rounded-full bg-canvas">
              <UploadIcon className="size-6 text-faint" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium text-ink">
                Drag & drop file di sini, atau klik untuk memilih
              </p>
              <p className="text-xs text-faint">Format: .xlsx atau .csv · Maks. 500 baris</p>
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      )}

      {step === "loading" && (
        <div className="flex flex-col items-center gap-3 py-10">
          <Spinner className="size-8 text-accent" />
          <p className="text-sm text-faint">Memvalidasi file…</p>
          <p className="text-xs text-faint">
            Proses ini dapat memakan beberapa detik untuk file besar.
          </p>
        </div>
      )}

      {(step === "preview" || step === "confirming") && preview && (
        <div className="space-y-4">
          {preview.summary.error > 0 && (
            <p className="text-sm text-faint">
              Hanya baris siap yang akan diimport. Baris error dilewati.
            </p>
          )}

          {/* Row filter pills */}
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                {
                  key: "all",
                  label: "Semua",
                  count: totalRows,
                  active: "bg-ink text-canvas border-ink",
                  inactive:
                    "border-line bg-canvas text-ink-soft hover:border-faint hover:text-ink",
                  badge: { active: "bg-white/20", inactive: "bg-line" },
                },
                {
                  key: "ready",
                  label: "Siap",
                  count: preview.summary.ready,
                  active: "bg-positive text-white border-positive",
                  inactive:
                    "border-positive/20 bg-positive-wash text-positive hover:border-positive/40",
                  badge: { active: "bg-white/25", inactive: "bg-positive/15" },
                },
                {
                  key: "skip",
                  label: "Skip",
                  count: preview.summary.skip,
                  active: "bg-accent text-white border-accent",
                  inactive:
                    "border-accent/20 bg-accent-wash text-accent-strong hover:border-accent/40",
                  badge: { active: "bg-white/25", inactive: "bg-accent/15" },
                },
                {
                  key: "error",
                  label: "Error",
                  count: preview.summary.error,
                  active: "bg-danger text-white border-danger",
                  inactive:
                    "border-danger/20 bg-danger-wash text-danger hover:border-danger/40",
                  badge: { active: "bg-white/25", inactive: "bg-danger/15" },
                },
              ] as const
            ).map(
              ({ key, label, count, active, inactive, badge }) =>
                count > 0 && (
                  <button
                    key={key}
                    onClick={() => setRowFilter(key)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      rowFilter === key ? active : inactive
                    }`}
                  >
                    {label}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums ${
                        rowFilter === key ? badge.active : badge.inactive
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                )
            )}
          </div>

          {/* Row table */}
          <div className="max-h-72 overflow-y-auto rounded-[var(--radius-card)] border border-line">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-line text-left text-[0.7rem] font-medium uppercase tracking-wide text-faint">
                  <th className="px-3 py-2">Baris</th>
                  <th className="px-3 py-2">Judul</th>
                  <th className="px-3 py-2">Durasi</th>
                  <th className="px-3 py-2">PG</th>
                  <th className="hidden px-3 py-2 md:table-cell">Token</th>
                  <th className="hidden px-3 py-2 md:table-cell">Kadaluwarsa</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-faint">
                      Tidak ada baris dengan filter ini.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr
                      key={r.row}
                      className={`border-b border-line/60 last:border-0 ${
                        r.status === "error" ? "bg-danger-wash/30" : ""
                      }`}
                    >
                      <td className="px-3 py-2 tabular text-faint">{r.row}</td>
                      <td className="max-w-[12rem] truncate px-3 py-2">{r.judul || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.durasi_menit != null ? `${r.durasi_menit} mnt` : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.passing_grade != null ? `${r.passing_grade}%` : "—"}
                      </td>
                      <td className="hidden px-3 py-2 font-mono md:table-cell">
                        {r.token || "—"}
                      </td>
                      <td className="hidden px-3 py-2 md:table-cell">
                        {r.expired_at
                          ? formatDateTime(new Date(r.expired_at.replace(" ", "T")).getTime())
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {r.status === "ready" ? (
                          <Badge tone="positive">Siap</Badge>
                        ) : r.status === "skip" ? (
                          <span>
                            <Badge tone="neutral">Skip</Badge>
                            {r.reason && (
                              <span className="ml-1.5 text-faint">{r.reason}</span>
                            )}
                          </span>
                        ) : (
                          <span>
                            <Badge tone="danger">Error</Badge>
                            {r.reason && (
                              <span className="ml-1.5 text-faint">{r.reason}</span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {step === "confirming" && (
            <div className="flex items-center gap-2 text-sm text-faint">
              <Spinner className="size-4 text-accent" />
              <span>Mengimpor ujian…</span>
            </div>
          )}
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-4 py-2">
          <div className="flex flex-wrap gap-2">
            {result.inserted > 0 && (
              <Badge tone="positive">{result.inserted} ujian baru ditambahkan</Badge>
            )}
            {result.skipped > 0 && (
              <Badge tone="neutral">{result.skipped} dilewati (sudah ada di DB)</Badge>
            )}
            {preview && preview.summary.error > 0 && (
              <Badge tone="warn">{preview.summary.error} baris error dilewati</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-faint">
            <FileTextIcon className="size-4" />
            <span>Import selesai.</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
