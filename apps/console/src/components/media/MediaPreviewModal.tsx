/**
 * Azhura CBT Console — MediaPreviewModal (#87).
 *
 * Shows full preview (image/audio/video) with metadata and actions:
 * copy URL to clipboard and delete (with confirm guard).
 */

import { useState } from "react";
import type { MediaFile } from "../../types";
import { mediaApi } from "../../lib/media-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { formatDateTime, formatBytes, resolveMediaUrl } from "../../lib/format";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CopyIcon, TrashIcon } from "../ui/icons";

interface MediaPreviewModalProps {
  item: MediaFile | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

const TYPE_LABELS: Record<string, string> = { image: "Gambar", audio: "Audio", video: "Video" };

export function MediaPreviewModal({ item, onClose, onDeleted }: MediaPreviewModalProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDelete() {
    if (!item) return;
    try {
      await mediaApi.remove(item.id);
      onDeleted(item.id);
      toast.success("File dihapus.");
      // onClose is called by onDeleted in the parent (MediaGalleryPage).
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal menghapus file."));
      // Do not re-throw: ConfirmDialog keeps itself open, user sees the toast.
    }
  }

  async function copyUrl() {
    if (!item) return;
    const full = resolveMediaUrl(item.url);
    try {
      await navigator.clipboard.writeText(full);
      toast.success("URL disalin.");
    } catch {
      toast.error("Gagal menyalin URL.");
    }
  }

  return (
    <>
      <Modal
        open={!!item}
        title={item?.originalName ?? ""}
        onClose={onClose}
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" leadingIcon={<TrashIcon className="size-4" />} onClick={() => setConfirmOpen(true)}>
              Hapus
            </Button>
            <Button variant="secondary" size="sm" leadingIcon={<CopyIcon className="size-4" />} onClick={copyUrl}>
              Salin URL
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Tutup
            </Button>
          </>
        }
      >
        {item && (
          <div className="space-y-4">
            {item.type === "image" && (
              <img
                src={resolveMediaUrl(item.url)}
                alt={item.originalName}
                className="max-h-80 w-full rounded-lg object-contain"
              />
            )}
            {item.type === "audio" && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio controls className="w-full" src={resolveMediaUrl(item.url)}>
                Browser Anda tidak mendukung pemutaran audio.
              </audio>
            )}
            {item.type === "video" && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video controls className="max-h-72 w-full rounded-lg" src={resolveMediaUrl(item.url)}>
                Browser Anda tidak mendukung pemutaran video.
              </video>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-faint">Nama asli</dt>
                <dd className="mt-0.5 break-all font-medium text-ink">{item.originalName}</dd>
              </div>
              <div>
                <dt className="text-xs text-faint">Tipe</dt>
                <dd className="mt-0.5 text-ink">{TYPE_LABELS[item.type]} ({item.mimeType})</dd>
              </div>
              <div>
                <dt className="text-xs text-faint">Ukuran</dt>
                <dd className="mt-0.5 text-ink">{formatBytes(item.sizeBytes)}</dd>
              </div>
              <div>
                <dt className="text-xs text-faint">Diunggah</dt>
                <dd className="mt-0.5 text-ink">{formatDateTime(item.createdAt)}</dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Hapus file?"
        message={`File "${item?.originalName}" akan dihapus permanen. Soal yang mereferensikan URL ini akan kehilangan medianya.`}
        confirmLabel="Hapus"
        tone="danger"
        onConfirm={handleDelete}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
