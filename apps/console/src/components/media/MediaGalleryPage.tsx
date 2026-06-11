import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaFile, MediaType } from "../../types";
import { mediaApi } from "../../lib/media-api";
import { supervisorMediaApi } from "../../lib/supervisor-media-api";
import { useAuthStore } from "../../stores/auth";
import { getErrorMessage } from "../../lib/errors";
import { useDebounce } from "../../hooks/useDebounce";
import { toast } from "../../stores/toast";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";
import { Spinner, CenterState } from "../ui/Spinner";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { MediaCard } from "./MediaCard";
import { MediaUploadZone } from "./MediaUploadZone";
import { MediaPreviewModal } from "./MediaPreviewModal";
import { Pagination } from "../ui/Pagination";
import { PageHelpButton } from "../ui/PageHelpButton";
import { Tooltip } from "../ui/Tooltip";
import { UploadIcon, SearchIcon, ImageIcon, AudioIcon, VideoIcon, TrashIcon, XIcon } from "../ui/icons";

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
  const role = useAuthStore((s) => s.role);
  const isAdmin = role === "admin";

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

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const selectionMode = selected.size > 0;

  const loadRef = useRef<(() => Promise<void>) | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const listFn = isAdmin ? mediaApi.list : supervisorMediaApi.list;
      const res = await listFn(
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
  }, [tab, debouncedSearch, page, isAdmin]);

  useEffect(() => { loadRef.current = () => load(); }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Reset page and clear selection when filters change.
  useEffect(() => { setPage(1); setSelected(new Set()); }, [tab, debouncedSearch]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(items.map((f) => f.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function handleUploaded(uploaded: MediaFile[]) {
    if (uploaded.length === 0) return;
    setUploadOpen(false);
    if (page === 1) loadRef.current?.();
    else setPage(1);
  }

  function handleDeleted(id: string) {
    setPreview(null);
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setItems((prev) => prev.filter((f) => f.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
    loadRef.current?.();
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => mediaApi.remove(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = ids.length - failed;
    setBulkDeleting(false);
    setConfirmBulkOpen(false);
    setSelected(new Set());
    if (failed === 0) toast.success(`${succeeded} file dihapus.`);
    else toast.error(`${succeeded} berhasil, ${failed} gagal dihapus.`);
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
        <div className="flex items-center gap-2">
          <PageHelpButton topic="media" />
          {/* Divider separates the help affordance from the action button. */}
          <span className="h-6 w-px bg-line-soft" aria-hidden="true" />
          <Button
            variant={uploadOpen ? "secondary" : "primary"}
            leadingIcon={<UploadIcon className="size-4" />}
            onClick={() => setUploadOpen((v) => !v)}
          >
            Upload
          </Button>
        </div>
      </div>

      {uploadOpen && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <MediaUploadZone
            onUploaded={handleUploaded}
            uploadFn={isAdmin ? undefined : supervisorMediaApi.upload}
          />
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
                tab === t.key ? "bg-surface text-ink shadow-sm" : "text-faint hover:text-ink"
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
            <MediaCard
              key={item.id}
              item={item}
              onClick={() => setPreview(item)}
              selected={selected.has(item.id)}
              selectionMode={selectionMode}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {/* Bulk action bar — floats above the chat FAB */}
      {selectionMode && (
        <div className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border-[2.5px] border-[var(--nb-ink)] bg-surface px-4 py-2 shadow-[3px_3px_0_var(--nb-ink)]">
          <span className="text-sm font-medium text-ink">{selected.size} dipilih</span>
          <span className="text-line">·</span>
          <button
            onClick={selectAll}
            className="text-sm text-accent hover:underline"
          >
            Pilih semua halaman ini
          </button>
          <span className="text-line">·</span>
          <Tooltip label="Batalkan pilihan">
            <button
              onClick={clearSelection}
              className="focus-ring rounded-md p-1 text-faint hover:text-ink"
              aria-label="Batalkan pilihan"
            >
              <XIcon className="size-4" />
            </button>
          </Tooltip>
          {isAdmin && (
          <button
            onClick={() => setConfirmBulkOpen(true)}
            className="focus-ring ml-1 flex items-center gap-1.5 rounded-full bg-danger px-3 py-1 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <TrashIcon className="size-3.5" />
            Hapus
          </button>
        )}
        </div>
      )}

      <MediaPreviewModal
        item={preview}
        onClose={() => setPreview(null)}
        onDeleted={handleDeleted}
      />

      {isAdmin && <ConfirmDialog
        open={confirmBulkOpen}
        title={`Hapus ${selected.size} file?`}
        message="File yang dipilih akan dihapus permanen. Soal yang mereferensikan URL file ini akan kehilangan medianya."
        confirmLabel={bulkDeleting ? "Menghapus…" : "Hapus semua"}
        tone="danger"
        onConfirm={handleBulkDelete}
        onClose={() => setConfirmBulkOpen(false)}
      />}
    </div>
  );
}
