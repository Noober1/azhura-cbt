/**
 * Azhura CBT Backend — Media upload utilities (#84).
 *
 * Validates uploaded files by MIME type (detected from magic bytes, not just
 * extension), enforces per-type size limits, writes to `backend/uploads/`,
 * and provides a delete helper. Called by `routes/admin/media.ts`.
 */

import { mkdirSync, existsSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";
import { fileTypeFromBuffer } from "file-type";
import { BadRequestError } from "./errors";
import { createLogger } from "./logger";
import type { MediaType } from "@azhura/shared";

const log = createLogger("Upload");

const UPLOAD_DIR = "./uploads";

const ALLOWED: Record<string, { type: MediaType; maxBytes: number; ext: string }> = {
  "image/jpeg": { type: "image", maxBytes: 5 * 1024 * 1024, ext: ".jpg" },
  "image/png":  { type: "image", maxBytes: 5 * 1024 * 1024, ext: ".png" },
  "image/webp": { type: "image", maxBytes: 5 * 1024 * 1024, ext: ".webp" },
  "image/gif":  { type: "image", maxBytes: 5 * 1024 * 1024, ext: ".gif" },
  "audio/mpeg": { type: "audio", maxBytes: 20 * 1024 * 1024, ext: ".mp3" },
  "audio/wav":  { type: "audio", maxBytes: 20 * 1024 * 1024, ext: ".wav" },
  "audio/ogg":  { type: "audio", maxBytes: 20 * 1024 * 1024, ext: ".ogg" },
  "video/mp4":  { type: "video", maxBytes: 50 * 1024 * 1024, ext: ".mp4" },
  "video/webm": { type: "video", maxBytes: 50 * 1024 * 1024, ext: ".webm" },
};

const TYPE_DIR: Record<MediaType, string> = {
  image: "images",
  audio: "audio",
  video: "video",
};

export interface SavedFile {
  filename: string;
  originalName: string;
  type: MediaType;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

/** Creates upload subdirectories on startup if they don't exist. */
export function ensureUploadDirs(): void {
  for (const dir of Object.values(TYPE_DIR)) {
    const path = `${UPLOAD_DIR}/${dir}`;
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
      log.info(`Created upload directory: ${path}`);
    }
  }
}

/**
 * Validates a Fetch API `File`, detects its MIME type from magic bytes,
 * enforces size limits, writes it to disk, and returns the saved metadata.
 */
export async function validateAndSave(file: File, uploadedByUserId: string): Promise<SavedFile> {
  const buffer = Buffer.from(await file.arrayBuffer());

  // Detect MIME from magic bytes — more reliable than the browser-supplied type.
  const detected = await fileTypeFromBuffer(buffer);
  const mimeType = detected?.mime ?? file.type;

  const meta = ALLOWED[mimeType];
  if (!meta) {
    throw new BadRequestError(
      `Tipe file tidak didukung: ${mimeType}. Gunakan JPEG, PNG, WebP, GIF, MP3, WAV, OGG, MP4, atau WebM.`
    );
  }

  if (buffer.byteLength > meta.maxBytes) {
    const maxMB = Math.round(meta.maxBytes / (1024 * 1024));
    throw new BadRequestError(
      `Ukuran file melebihi batas ${maxMB}MB untuk tipe ${meta.type}.`
    );
  }

  const uuid = randomUUID();
  const filename = `${uuid}${meta.ext}`;
  const subdir = TYPE_DIR[meta.type];
  const diskPath = `${UPLOAD_DIR}/${subdir}/${filename}`;

  await Bun.write(diskPath, buffer);
  log.info("File saved", { filename, mimeType, sizeBytes: buffer.byteLength, uploadedByUserId });

  return {
    filename,
    originalName: file.name || filename,
    type: meta.type,
    mimeType,
    sizeBytes: buffer.byteLength,
    url: `/uploads/${subdir}/${filename}`,
  };
}

/** Deletes a file from disk. Errors are logged but not rethrown. */
export async function deleteUploadFile(filename: string, type: MediaType): Promise<void> {
  const subdir = TYPE_DIR[type];
  const diskPath = `${UPLOAD_DIR}/${subdir}/${filename}`;
  try {
    unlinkSync(diskPath);
    log.info("File deleted", { filename });
  } catch (err) {
    // File may already be missing (e.g. manual cleanup) — log and continue.
    log.warn("Could not delete file", { filename, err });
  }
}

/** Extension → Content-Type map for the static file handler in index.ts. */
export const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};
