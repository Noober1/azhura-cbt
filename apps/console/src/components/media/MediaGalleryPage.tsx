/**
 * Azhura CBT Console — Media Gallery (#87).
 *
 * Browse, upload, and delete media files. Tabs filter by type (all/image/audio/video),
 * debounced search by filename, and pagination. Images render as a square grid;
 * audio/video render as a list so file names are readable.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaFile, MediaType } from "../../types";
import { mediaApi } from "../../lib/media-api";
import { getErrorMessage } from "../../lib/errors";
import { useDebounce } from "../../hooks/useDebounce";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";
import { Spinner, CenterState } from "../ui/Spinner";
import { MediaCard } from "./MediaCard";
import { MediaUploadZone } from "./MediaUploadZone";
import { MediaPreviewModal } from "./MediaPreviewModal";
import { UploadIcon, SearchIcon, ImageIcon, AudioIcon, VideoIcon } from "../ui/icons";
import { Pagination } from "../ui/Pagination";

type TabType = "all" | MediaType;

interface Tab {
  key: TabType;
  label: string;
  icon?: React.ReactNode;
}

const TABS: Tab[] = [
  { key: "all", label: "Semua" },
  { key: "image", label: "Gambar", icon: <ImageIcon className="size-4" /> },
  { key: "audio", label: "Audio", icon: <AudioIcon className="size-4" /> },
  { key: "video", label: "Video", icon: <VideoIcon className="size-4" /> },
];

const PAGE_SIZE = 20;

export function MediaGalleryPage() {
  const [tab, setTab] = useState<TabType>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<MediaFile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [preview, setPreview] = useState<MediaFile | null>(null);

  // Keep a stable reference to the current load params so post-action refreshes
  // can trigger the same load without capturing stale closures.
  const loadRef = useRef<(() => Promise<void>) | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await mediaApi.list(
        { type: tab !== "all" ? tab : undefined, q: debouncedSearch.trim() || undefined, page, limit: PAGE_SIZE },
        signal
      );
      if (signal?.aborted) return;
      setItems(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      if (signal?.aborted) return;
      setError(getErrorMessage(err, "Gagal memuat media."));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [tab, debouncedSearch, page]);

  // Store latest load so callbacks can trigger a refresh.
  useEffect(() => { loadRef.current = () => load(); }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Reset to page 1 when filters change so stale page offsets don't carry over.
  useEffect(() => { setPage(1); }, [tab, debouncedSearch]);

  function handleUploaded(uploaded: MediaFile[]) {
    if (uploaded.length === 0) return;
    // Re-fetch from page 1 so the new files appear at the top of the grid
    // rather than corrupting the current page slice.
    setPage(1);
    setUploadOpen(false);
    // setPage triggers load via useCallback deps; no extra call needed.
  }

  function handleDeleted(id: string) {
    setPreview(null);
    // Re-fetch to keep pagination consistent. Remove the item optimistically
    // first so the modal can close without a visible flash.
    setItems((prev) => prev.filter((f) => f.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
    loadRef.current?.();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Media</h1>
          <p className="mt-0.5 text-sm text-faint">{total} file tersimpan</p>
        </div>
        <Button
          variant={uploadOpen ? "secondary" : "primary"}
          leadingIcon={<UploadIcon className="size-4" />}
          onClick={() => setUploadOpen((v) => !v)}
        >
          Upload
        </Button>
      </div>

      {uploadOpen && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <MediaUploadZone onUploaded={handleUploaded} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-line bg-canvas p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-pressed={tab === t.key}
              className={`focus-ring flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-surface text-ink shadow-sm"
                  : "text-faint hover:text-ink"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            placeholder="Cari nama file…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {loading ? (
        <CenterState><Spinner /><span>Memuat…</span></CenterState>
      ) : error ? (
        <CenterState>
          <p className="text-danger">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => loadRef.current?.()}>Coba lagi</Button>
        </CenterState>
      ) : items.length === 0 ? (
        <CenterState>
          {tab === "image" ? <ImageIcon className="size-8 opacity-40" /> :
           tab === "audio" ? <AudioIcon className="size-8 opacity-40" /> :
           tab === "video" ? <VideoIcon className="size-8 opacity-40" /> :
           <UploadIcon className="size-8 opacity-40" />}
          <p>Belum ada file{debouncedSearch ? ` yang cocok dengan "${debouncedSearch}"` : ""}.</p>
          {!debouncedSearch && (
            <Button size="sm" onClick={() => setUploadOpen(true)}>Upload sekarang</Button>
          )}
        </CenterState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <MediaCard key={item.id} item={item} onClick={() => setPreview(item)} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      <MediaPreviewModal
        item={preview}
        onClose={() => setPreview(null)}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
