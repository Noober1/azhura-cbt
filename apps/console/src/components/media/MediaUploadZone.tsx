/**
 * Azhura CBT Console — MediaUploadZone (#87).
 *
 * Drag-and-drop + click-to-pick upload zone. Client-validates MIME type and size
 * before uploading. Shows a single aggregate progress indicator ("3 of 10 uploaded")
 * instead of per-file bars so large batches don't overflow the page.
 */

import { useEffect, useRef, useState } from "react";
import type { MediaFile } from "../../types";
import { mediaApi } from "../../lib/media-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { UploadIcon } from "../ui/icons";

const ALLOWED_TYPES: Record<string, { maxBytes: number; label: string }> = {
  "image/jpeg": { maxBytes: 5 * 1024 * 1024, label: "Gambar ≤5 MB" },
  "image/png":  { maxBytes: 5 * 1024 * 1024, label: "Gambar ≤5 MB" },
  "image/webp": { maxBytes: 5 * 1024 * 1024, label: "Gambar ≤5 MB" },
  "image/gif":  { maxBytes: 5 * 1024 * 1024, label: "Gambar ≤5 MB" },
  "audio/mpeg": { maxBytes: 20 * 1024 * 1024, label: "Audio ≤20 MB" },
  "audio/wav":  { maxBytes: 20 * 1024 * 1024, label: "Audio ≤20 MB" },
  "audio/ogg":  { maxBytes: 20 * 1024 * 1024, label: "Audio ≤20 MB" },
  "video/mp4":  { maxBytes: 50 * 1024 * 1024, label: "Video ≤50 MB" },
  "video/webm": { maxBytes: 50 * 1024 * 1024, label: "Video ≤50 MB" },
};

const ACCEPT = Object.keys(ALLOWED_TYPES).join(",");

interface MediaUploadZoneProps {
  onUploaded: (files: MediaFile[]) => void;
  /** Override the upload function (e.g. to use supervisor endpoint instead of admin). */
  uploadFn?: (file: File, onProgress?: (pct: number) => void) => Promise<MediaFile>;
}

interface UploadState {
  total: number;
  done: number;
  failed: number;
  active: boolean;
}

const IDLE: UploadState = { total: 0, done: 0, failed: 0, active: false };

export function MediaUploadZone({ onUploaded, uploadFn = mediaApi.upload }: MediaUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<UploadState>(IDLE);

  useEffect(() => () => {
    if (clearTimerRef.current !== null) clearTimeout(clearTimerRef.current);
  }, []);

  function validate(files: FileList | null): File[] {
    if (!files) return [];
    const valid: File[] = [];
    for (const file of Array.from(files)) {
      const rule = ALLOWED_TYPES[file.type];
      if (!rule) { toast.error(`${file.name}: tipe file tidak didukung.`); continue; }
      if (file.size > rule.maxBytes) { toast.error(`${file.name}: ${rule.label}.`); continue; }
      valid.push(file);
    }
    return valid;
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;

    setState({ total: files.length, done: 0, failed: 0, active: true });

    const results: MediaFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const uploaded = await uploadFn(file);
        results.push(uploaded);
        setState((prev) => ({ ...prev, done: prev.done + 1 }));
      } catch (err) {
        setState((prev) => ({ ...prev, failed: prev.failed + 1, done: prev.done + 1 }));
        toast.error(`Gagal upload ${file.name}: ${getErrorMessage(err)}`);
      }
    }

    if (results.length > 0) onUploaded(results);

    clearTimerRef.current = setTimeout(() => setState(IDLE), 1500);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    uploadFiles(validate(e.dataTransfer.files));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    uploadFiles(validate(e.target.files));
    if (inputRef.current) inputRef.current.value = "";
  }

  const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;
  const successCount = state.done - state.failed;

  return (
    <div className="space-y-3">
      <div
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !state.active && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          state.active
            ? "cursor-default border-line bg-canvas text-faint"
            : dragging
            ? "border-accent bg-accent/5 text-accent"
            : "border-line bg-canvas text-faint hover:border-faint hover:text-ink-soft"
        }`}
      >
        <UploadIcon className="size-7" />
        <p className="text-sm font-medium">Seret file ke sini atau klik untuk pilih</p>
        <p className="text-xs">Gambar ≤5 MB · Audio ≤20 MB · Video ≤50 MB</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={handleChange}
        />
      </div>

      {state.active && (
        <div className="rounded-lg border border-line bg-surface px-4 py-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink">
              {state.done < state.total
                ? `Mengupload ${state.done + 1} dari ${state.total}…`
                : state.failed > 0
                ? `Selesai — ${successCount} berhasil, ${state.failed} gagal`
                : `Selesai — ${successCount} file diupload`}
            </span>
            <span className="text-faint text-xs">{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
