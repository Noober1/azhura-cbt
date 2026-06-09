/**
 * Azhura CBT Console — MediaPickerModal (#88).
 *
 * Single-select media picker that reuses the existing MediaCard and
 * MediaUploadZone primitives. Designed to open from the WYSIWYG editor toolbar
 * so supervisors can browse and insert media into question text.
 *
 * Props accept pluggable list/upload functions so both admin and supervisor
 * API endpoints can be used without coupling this modal to a specific role.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaFile, MediaListResponse } from "../../types";
import { Modal } from "../ui/Modal";
import { MediaCard } from "../media/MediaCard";
import { MediaUploadZone } from "../media/MediaUploadZone";
import { Spinner } from "../ui/Spinner";

type ListFn = (
  params: { type?: string; q?: string; page?: number; limit?: number },
  signal?: AbortSignal
) => Promise<MediaListResponse>;

type UploadFn = (file: File, onProgress?: (pct: number) => void) => Promise<MediaFile>;

interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (file: MediaFile) => void;
  listFn: ListFn;
  uploadFn: UploadFn;
}

type TabFilter = "all" | "image" | "audio" | "video";

const PAGE_SIZE = 16;

const TABS: { key: TabFilter; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "image", label: "Gambar" },
  { key: "audio", label: "Audio" },
  { key: "video", label: "Video" },
];

export function MediaPickerModal({
  open,
  onClose,
  onSelect,
  listFn,
  uploadFn,
}: MediaPickerModalProps) {
  const [tab, setTab] = useState<TabFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<MediaFile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    (p: number, q: string, t: TabFilter) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      listFn(
        { type: t === "all" ? undefined : t, q: q || undefined, page: p, limit: PAGE_SIZE },
        ctrl.signal
      )
        .then((res) => {
          setItems(res.data);
          setTotal(res.meta.total);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    },
    [listFn]
  );

  useEffect(() => {
    if (!open) return;
    load(page, query, tab);
    return () => abortRef.current?.abort();
  }, [open, page, query, tab, load]);

  function handleTabChange(t: TabFilter) {
    setTab(t);
    setPage(1);
  }

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setPage(1);
  }

  function handleUploaded(files: MediaFile[]) {
    setShowUpload(false);
    if (files.length > 0) {
      setPage(1);
      load(1, query, tab);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Modal
      open={open}
      title="Pilih Media"
      description="Klik media untuk menyisipkan ke editor"
      onClose={onClose}
      size="lg"
    >
      {/* Tabs + search */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              className={`focus-ring rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === t.key
                  ? "bg-accent text-white"
                  : "bg-canvas text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Cari nama file…"
          value={query}
          onChange={handleSearch}
          className="focus-ring h-7 flex-1 rounded-md border border-line bg-canvas px-2.5 text-xs placeholder:text-faint"
        />
        <button
          onClick={() => setShowUpload((v) => !v)}
          className="focus-ring rounded-md border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-ink-soft hover:text-ink"
        >
          {showUpload ? "Tutup upload" : "Upload baru"}
        </button>
      </div>

      {/* Upload zone (collapsible) */}
      {showUpload && (
        <div className="mb-4">
          <MediaUploadZone onUploaded={handleUploaded} uploadFn={uploadFn} />
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-faint">
          {query ? "Tidak ada media yang cocok." : "Belum ada media. Upload dulu."}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {items.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              onClick={() => onSelect(item)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="focus-ring rounded border border-line px-2 py-0.5 text-xs disabled:opacity-40"
          >
            &lsaquo;
          </button>
          <span className="text-xs text-faint">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="focus-ring rounded border border-line px-2 py-0.5 text-xs disabled:opacity-40"
          >
            &rsaquo;
          </button>
        </div>
      )}
    </Modal>
  );
}
