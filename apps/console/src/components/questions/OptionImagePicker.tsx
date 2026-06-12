/**
 * Azhura CBT Console — Per-option image picker (#163).
 *
 * Lets the author attach ONE image from the media library to a multiple-choice
 * option, separate from the deliberately lean InlineEditor. Reuses the
 * existing MediaPickerModal (list/upload functions are injected, so both the
 * admin and supervisor media endpoints work). Stores the media-library
 * `/uploads/...` path; the thumbnail resolves it against the backend origin.
 */

import { useState } from "react";
import type { MediaFile, MediaListResponse } from "../../types";
import { MediaPickerModal } from "../editor/MediaPickerModal";
import { Tooltip } from "../ui/Tooltip";
import { ImageIcon, XIcon } from "../ui/icons";
import { resolveMediaUrl } from "../../lib/format";
import { toast } from "../../stores/toast";

type ListFn = (
  params: { type?: string; q?: string; page?: number; limit?: number },
  signal?: AbortSignal
) => Promise<MediaListResponse>;

type UploadFn = (file: File, onProgress?: (pct: number) => void) => Promise<MediaFile>;

interface OptionImagePickerProps {
  /** Attached image as a `/uploads/...` path, or null when none. */
  imageUrl: string | null;
  /** Called with the media-library path when an image is picked. */
  onSelect: (url: string) => void;
  /** Called when the attached image is removed. */
  onClear: () => void;
  disabled?: boolean;
  /** Option letter (A–F) for accessible labels. */
  optionLabel: string;
  listFn: ListFn;
  uploadFn: UploadFn;
}

export function OptionImagePicker({
  imageUrl,
  onSelect,
  onClear,
  disabled,
  optionLabel,
  listFn,
  uploadFn,
}: OptionImagePickerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  function handleSelect(file: MediaFile) {
    if (file.type !== "image") {
      toast.error("Hanya gambar yang dapat dilampirkan ke opsi.");
      return;
    }
    setPickerOpen(false);
    onSelect(file.url);
  }

  return (
    <div className="mt-1.5">
      {imageUrl ? (
        <div className="relative inline-block">
          <img
            src={resolveMediaUrl(imageUrl)}
            alt={`Gambar opsi ${optionLabel}`}
            className="h-20 max-w-48 rounded-md border border-line object-contain"
          />
          <Tooltip label={`Hapus gambar opsi ${optionLabel}`} className="absolute -right-2 -top-2">
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              aria-label={`Hapus gambar opsi ${optionLabel}`}
              className="focus-ring flex size-5 items-center justify-center rounded-full border border-line bg-surface text-faint shadow-sm transition-colors hover:bg-danger-wash hover:text-danger disabled:opacity-40"
            >
              <XIcon className="size-3" />
            </button>
          </Tooltip>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
          className="focus-ring inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-faint transition-colors hover:bg-accent-wash hover:text-accent disabled:opacity-40"
        >
          <ImageIcon className="size-3.5" />
          Tambah gambar
        </button>
      )}

      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelect}
        listFn={listFn}
        uploadFn={uploadFn}
      />
    </div>
  );
}
