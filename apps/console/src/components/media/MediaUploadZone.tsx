/**
 * Azhura CBT Console — MediaUploadZone (#87).
 *
 * Drag-and-drop + click-to-pick upload zone. Client-validates MIME type and size
 * before uploading. Shows per-file progress bars and resolves with the uploaded
 * MediaFile list for the parent to merge into its gallery state.
 */

import { useEffect, useRef, useState } from "react";
import type { MediaFile } from "../../types";
import { mediaApi } from "../../lib/media-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { UploadIcon } from "../ui/icons";

const ALLOWED_TYPES: Record<string, { maxBytes: number; label: string }> = {
  "image/jpeg": { maxBytes: 5 * 1024 * 1024, label: "Gambar ≤5 MB" },
  "image/png": { maxBytes: 5 * 1024 * 1024, label: "Gambar ≤5 MB" },
  "image/webp": { maxBytes: 5 * 1024 * 1024, label: "Gambar ≤5 MB" },
  "image/gif": { maxBytes: 5 * 1024 * 1024, label: "Gambar ≤5 MB" },
  "audio/mpeg": { maxBytes: 20 * 1024 * 1024, label: "Audio ≤20 MB" },
  "audio/wav": { maxBytes: 20 * 1024 * 1024, label: "Audio ≤20 MB" },
  "audio/ogg": { maxBytes: 20 * 1024 * 1024, label: "Audio ≤20 MB" },
  "video/mp4": { maxBytes: 50 * 1024 * 1024, label: "Video ≤50 MB" },
  "video/webm": { maxBytes: 50 * 1024 * 1024, label: "Video ≤50 MB" },
};

const ACCEPT = Object.keys(ALLOWED_TYPES).join(",");

interface MediaUploadZoneProps {
  onUploaded: (files: MediaFile[]) => void;
  /** Override the upload function (e.g. to use supervisor endpoint instead of admin). */
  uploadFn?: (file: File, onProgress?: (pct: number) => void) => Promise<MediaFile>;
}

interface FileProgress {
  name: string;
  pct: number;
  done: boolean;
  error: boolean;
}

export function MediaUploadZone({ onUploaded, uploadFn = mediaApi.upload }: MediaUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<Map<string, FileProgress>>(new Map());

  // Cancel the clear timer on unmount to avoid setState on an unmounted component.
  useEffect(() => () => {
    if (clearTimerRef.current !== null) clearTimeout(clearTimerRef.current);
  }, []);

  function validate(files: FileList | null): File[] {
    if (!files) return [];
    const valid: File[] = [];
    for (const file of Array.from(files)) {
      const rule = ALLOWED_TYPES[file.type];
      if (!rule) {
        toast.error(`${file.name}: tipe file tidak didukung.`);
        continue;
      }
      if (file.size > rule.maxBytes) {
        toast.error(`${file.name}: ${rule.label}.`);
        continue;
      }
      valid.push(file);
    }
    return valid;
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;

    // Use `${index}:${name}` as key to avoid collision when two files share the same name.
    const initial = new Map<string, FileProgress>(
      files.map((f, i) => [`${i}:${f.name}`, { name: f.name, pct: 0, done: false, error: false }])
    );
    setProgress(initial);

    const results: MediaFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const key = `${i}:${file.name}`;
      try {
        const uploaded = await uploadFn(file, (pct) => {
          setProgress((prev) => {
            const next = new Map(prev);
            next.set(key, { name: file.name, pct, done: false, error: false });
            return next;
          });
        });
        results.push(uploaded);
        setProgress((prev) => {
          const next = new Map(prev);
          next.set(key, { name: file.name, pct: 100, done: true, error: false });
          return next;
        });
      } catch (err) {
        setProgress((prev) => {
          const next = new Map(prev);
          next.set(key, { name: file.name, pct: 0, done: false, error: true });
          return next;
        });
        toast.error(`Gagal upload ${file.name}: ${getErrorMessage(err)}`);
      }
    }

    if (results.length > 0) onUploaded(results);

    clearTimerRef.current = setTimeout(() => setProgress(new Map()), 1500);
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

  const activeUploads = Array.from(progress.values());

  return (
    <div className="space-y-3">
      <div
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragging
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

      {activeUploads.length > 0 && (
        <ul className="space-y-2">
          {activeUploads.map((f) => (
            <li key={f.name} className="rounded-lg border border-line bg-surface px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-ink">{f.name}</span>
                <span className={`shrink-0 ${f.error ? "text-danger" : "text-faint"}`}>
                  {f.error ? "Gagal" : f.done ? "Selesai" : `${f.pct}%`}
                </span>
              </div>
              {!f.error && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${f.pct}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
