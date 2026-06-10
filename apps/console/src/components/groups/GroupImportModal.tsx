/**
 * Azhura CBT Console — Group import modal (#72).
 *
 * Multi-state flow:
 *  idle       → drag-drop zone + template download
 *  loading    → dry-run in progress (parsing + validating)
 *  preview    → show row results, confirm or cancel
 *  confirming → executing upsert
 *  done       → show result + optional error report download
 */

import { useRef, useState } from "react";
import { groupsImportApi } from "../../lib/groups-import-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { saveBlob } from "../../lib/download";
import type { GroupImportPreview, GroupImportConfirmResult } from "../../types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Spinner } from "../ui/Spinner";
import { UploadIcon, DownloadIcon, FileTextIcon } from "../ui/icons";

type Step = "idle" | "loading" | "preview" | "confirming" | "done";

interface GroupImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function GroupImportModal({ open, onClose, onImported }: GroupImportModalProps) {
  const [step, setStep] = useState<Step>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<GroupImportPreview | null>(null);
  const [result, setResult] = useState<GroupImportConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("idle");
    setPreview(null);
    setResult(null);
    setError(null);
    setDragOver(false);
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
      const data = await groupsImportApi.dryRun(file);
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
      const res = await groupsImportApi.confirm(preview.sessionId);
      setResult(res);
      setStep("done");
      onImported();
      toast.success(
        `Import selesai: ${res.inserted} grup baru, ${res.updated} diperbarui.`
      );
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal mengeksekusi import."));
      setStep("preview");
    }
  }

  function downloadErrorReport() {
    if (!preview) return;
    const errorRows = preview.rows.filter((r) => r.status === "error");
    if (errorRows.length === 0) return;
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = ["baris,code,name,error"];
    errorRows.forEach((r) =>
      lines.push(`${r.row},${cell(r.code)},${cell(r.name)},${cell(r.error ?? "")}`)
    );
    saveBlob(new Blob([lines.join("\n")], { type: "text/csv" }), "grup-import-errors.csv");
  }

  const errorCount = preview ? preview.total - preview.validCount : 0;

  return (
    <Modal
      open={open}
      title="Import Grup dari Spreadsheet"
      description="Upload file .xlsx atau .csv dengan kolom: code, name"
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
            {preview && preview.validCount > 0 && (
              <Button onClick={handleConfirm}>
                Import {preview.validCount} Grup Valid
              </Button>
            )}
          </>
        ) : step === "done" ? (
          <>
            {errorCount > 0 && (
              <Button
                variant="secondary"
                leadingIcon={<DownloadIcon className="size-4" />}
                onClick={downloadErrorReport}
              >
                Unduh Laporan Error
              </Button>
            )}
            <Button onClick={handleClose}>Selesai</Button>
          </>
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
                groupsImportApi.downloadTemplate("xlsx").catch(() => toast.error("Gagal mengunduh template."))
              }
            >
              .xlsx
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<DownloadIcon className="size-4" />}
              onClick={() =>
                groupsImportApi.downloadTemplate("csv").catch(() => toast.error("Gagal mengunduh template."))
              }
            >
              .csv
            </Button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragOver
                ? "border-accent bg-accent/5"
                : "border-line hover:border-faint hover:bg-canvas"
            }`}
          >
            <span className="grid size-12 place-items-center rounded-full bg-canvas">
              <UploadIcon className="size-6 text-faint" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium text-ink">
                Drag & drop file di sini, atau klik untuk memilih
              </p>
              <p className="text-xs text-faint">Format: .xlsx atau .csv · Maks. 200 baris</p>
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
        </div>
      )}

      {(step === "preview" || step === "confirming") && preview && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{preview.total} baris total</Badge>
            <Badge tone="positive">{preview.validCount} valid</Badge>
            {errorCount > 0 && <Badge tone="danger">{errorCount} error</Badge>}
          </div>

          {errorCount > 0 && (
            <p className="text-sm text-faint">
              Hanya baris valid yang akan diimport. Baris error dilewati.
            </p>
          )}

          {/* Row table */}
          <div className="max-h-64 overflow-y-auto rounded-[var(--radius-card)] border border-line">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-line text-left text-[0.7rem] font-medium uppercase tracking-wide text-faint">
                  <th className="px-3 py-2">Baris</th>
                  <th className="px-3 py-2">Kode</th>
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr
                    key={r.row}
                    className={`border-b border-line/60 last:border-0 ${
                      r.status === "error" ? "bg-danger-wash/30" : ""
                    }`}
                  >
                    <td className="px-3 py-2 tabular text-faint">{r.row}</td>
                    <td className="px-3 py-2 font-mono font-semibold">{r.code || "—"}</td>
                    <td className="px-3 py-2">{r.name || "—"}</td>
                    <td className="px-3 py-2">
                      {r.status === "valid" ? (
                        <Badge tone="positive">Valid</Badge>
                      ) : (
                        <span className="text-danger" title={r.error}>
                          <Badge tone="danger">Error</Badge>
                          <span className="ml-1.5 text-faint">{r.error}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {step === "confirming" && (
            <div className="flex items-center gap-2 text-sm text-faint">
              <Spinner className="size-4 text-accent" />
              <span>Mengimpor grup…</span>
            </div>
          )}
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-4 py-2">
          <div className="flex flex-wrap gap-2">
            <Badge tone="positive">{result.inserted} grup baru ditambahkan</Badge>
            <Badge tone="accent">{result.updated} grup diperbarui</Badge>
            {errorCount > 0 && <Badge tone="danger">{errorCount} baris dilewati (error)</Badge>}
          </div>
          {errorCount > 0 && (
            <p className="text-sm text-faint">
              Unduh laporan error untuk melihat detail baris yang gagal.
            </p>
          )}
          <div className="flex items-center gap-2 text-sm text-faint">
            <FileTextIcon className="size-4" />
            <span>Import selesai.</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
