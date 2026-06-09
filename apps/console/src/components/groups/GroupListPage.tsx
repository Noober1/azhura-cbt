/**
 * Azhura CBT Console — Groups workspace (list).
 *
 * Lists groups with debounced search + pagination, and is the entry point for
 * group CRUD. Deleting a group unassigns its members (it does not delete them);
 * the confirm copy and the resulting toast make that explicit.
 */

import { useCallback, useEffect, useState } from "react";
import { groupsApi } from "../../lib/groups-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { useDebounce } from "../../hooks/useDebounce";
import type { GroupSummary } from "../../types";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Input } from "../ui/Field";
import { Spinner, CenterState } from "../ui/Spinner";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { GroupFormModal } from "./GroupFormModal";
import { GroupImportModal } from "./GroupImportModal";
import {
  PlusIcon,
  SearchIcon,
  PencilIcon,
  TrashIcon,
  LayersIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  UploadIcon,
} from "../ui/icons";

const PAGE_SIZE = 10;

export function GroupListPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [page, setPage] = useState(1);

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GroupSummary | null>(null);
  const [deleting, setDeleting] = useState<GroupSummary | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await groupsApi.list({
        q: debouncedSearch.trim() || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setGroups(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      setError(getErrorMessage(err, "Gagal memuat group."));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(group: GroupSummary) {
    setEditing(group);
    setFormOpen(true);
  }

  function handleSaved() {
    setFormOpen(false);
    setEditing(null);
    load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      const res = await groupsApi.remove(deleting.id);
      toast.success(
        res.unassignedMembers > 0
          ? `Group dihapus. ${res.unassignedMembers} siswa kini tanpa group.`
          : "Group dihapus."
      );
      if (groups.length === 1 && page > 1) setPage((p) => p - 1);
      else load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal menghapus group."));
      throw err;
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Group</h1>
          <p className="mt-1 text-sm text-faint">
            {total > 0 ? `${total} group` : "Belum ada group"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setImportOpen(true)}
            leadingIcon={<UploadIcon className="size-4" />}
          >
            Import
          </Button>
          <Button onClick={openCreate} leadingIcon={<PlusIcon className="size-4" />}>
            Buat group
          </Button>
        </div>
      </div>

      <div className="relative mt-6 max-w-sm">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama group…"
          className="pl-9"
          aria-label="Cari group"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {loading ? (
          <CenterState>
            <Spinner className="size-6 text-accent" />
            <span>Memuat group…</span>
          </CenterState>
        ) : error ? (
          <CenterState>
            <span className="text-danger">{error}</span>
            <Button variant="secondary" size="sm" onClick={load}>
              Coba lagi
            </Button>
          </CenterState>
        ) : groups.length === 0 ? (
          <CenterState>
            <span className="grid size-12 place-items-center rounded-full bg-canvas text-faint">
              <LayersIcon className="size-6" />
            </span>
            <span>
              {debouncedSearch
                ? "Tidak ada group yang cocok."
                : "Buat group pertama untuk mengelompokkan siswa."}
            </span>
            {!debouncedSearch && (
              <Button size="sm" onClick={openCreate} leadingIcon={<PlusIcon className="size-4" />}>
                Buat group
              </Button>
            )}
          </CenterState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-faint">
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Kode</th>
                <th className="px-4 py-3 font-medium">Anggota</th>
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr
                  key={group.id}
                  className="border-b border-line/70 transition-colors last:border-0 hover:bg-canvas/60"
                >
                  <td className="px-4 py-3 font-medium text-ink">{group.name}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold tracking-wider text-ink">
                      {group.code}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={group.memberCount > 0 ? "accent" : "neutral"}>
                      {group.memberCount} siswa
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(group)}
                        aria-label={`Edit ${group.name}`}
                        className="focus-ring rounded-md p-2 text-faint transition-colors hover:bg-canvas hover:text-ink"
                      >
                        <PencilIcon className="size-4" />
                      </button>
                      <button
                        onClick={() => setDeleting(group)}
                        aria-label={`Hapus ${group.name}`}
                        className="focus-ring rounded-md p-2 text-faint transition-colors hover:bg-danger-wash hover:text-danger"
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && !error && groups.length > 0 && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-faint">
          <span className="tabular">
            Halaman {page} dari {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              leadingIcon={<ChevronLeftIcon className="size-4" />}
            >
              Sebelumnya
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Berikutnya
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <GroupFormModal
        open={formOpen}
        group={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />

      <GroupImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => { setImportOpen(false); load(); }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Hapus group?"
        message={
          deleting
            ? `Group "${deleting.name}" akan dihapus. ${
                deleting.memberCount > 0
                  ? `${deleting.memberCount} siswa di dalamnya tidak ikut terhapus — mereka hanya menjadi tanpa group.`
                  : "Group ini tidak memiliki anggota."
              }`
            : ""
        }
        confirmLabel="Hapus group"
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
