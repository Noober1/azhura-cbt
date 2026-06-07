/**
 * Azhura CBT Console — Exams workspace (list).
 *
 * Lists exams with debounced search and pagination, and is the entry point for
 * all exam CRUD: create/edit via <ExamFormModal/>, delete via <ConfirmDialog/>,
 * and "Kelola soal" routes into the per-exam question manager.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { examsApi } from "../../lib/exams-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { useDebounce } from "../../hooks/useDebounce";
import { formatDateTime, formatDuration, isPast } from "../../lib/format";
import type { ExamDetail, ExamSummary } from "../../types";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Input } from "../ui/Field";
import { Spinner, CenterState } from "../ui/Spinner";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { IconButton } from "../ui/IconButton";
import { ExamFormModal } from "./ExamFormModal";
import {
  PlusIcon,
  SearchIcon,
  PencilIcon,
  TrashIcon,
  FileTextIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  KeyIcon,
  UsersIcon,
} from "../ui/icons";

const PAGE_SIZE = 10;

export function ExamListPage() {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [page, setPage] = useState(1);

  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExamSummary | null>(null);
  const [deleting, setDeleting] = useState<ExamSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await examsApi.list({
        q: debouncedSearch.trim() || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setExams(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      setError(getErrorMessage(err, "Gagal memuat daftar ujian."));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset to page 1 whenever the search term changes.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(exam: ExamSummary) {
    setEditing(exam);
    setFormOpen(true);
  }

  function handleSaved(_saved: ExamDetail) {
    setFormOpen(false);
    setEditing(null);
    load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await examsApi.remove(deleting.id);
      toast.success("Ujian dihapus.");
      // If the last row on a page is removed, step back a page.
      if (exams.length === 1 && page > 1) setPage((p) => p - 1);
      else load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal menghapus ujian."));
      throw err;
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Ujian</h1>
          <p className="mt-1 text-sm text-faint">
            {total > 0
              ? `${total} paket ujian`
              : "Belum ada paket ujian"}
          </p>
        </div>
        <Button onClick={openCreate} leadingIcon={<PlusIcon className="size-4" />}>
          Buat ujian
        </Button>
      </div>

      {/* Search */}
      <div className="relative mt-6 max-w-sm">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari judul ujian…"
          className="pl-9"
          aria-label="Cari ujian"
        />
      </div>

      {/* Table / states */}
      <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {loading ? (
          <CenterState>
            <Spinner className="size-6 text-accent" />
            <span>Memuat ujian…</span>
          </CenterState>
        ) : error ? (
          <CenterState>
            <span className="text-danger">{error}</span>
            <Button variant="secondary" size="sm" onClick={load}>
              Coba lagi
            </Button>
          </CenterState>
        ) : exams.length === 0 ? (
          <CenterState>
            <span className="grid size-12 place-items-center rounded-full bg-canvas text-faint">
              <FileTextIcon className="size-6" />
            </span>
            <span>
              {debouncedSearch
                ? "Tidak ada ujian yang cocok dengan pencarian."
                : "Mulai dengan membuat paket ujian pertama."}
            </span>
            {!debouncedSearch && (
              <Button size="sm" onClick={openCreate} leadingIcon={<PlusIcon className="size-4" />}>
                Buat ujian
              </Button>
            )}
          </CenterState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-faint">
                <th className="px-4 py-3 font-medium">Judul</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Soal</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Durasi</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Kedaluwarsa</th>
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr
                  key={exam.id}
                  className="group border-b border-line/70 transition-colors last:border-0 hover:bg-canvas/60"
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/exams/${exam.id}`)}
                      className="focus-ring rounded text-left font-medium text-ink hover:text-accent"
                    >
                      {exam.title}
                    </button>
                    <div className="mt-1 flex items-center gap-2">
                      {exam.token && (
                        <span className="inline-flex items-center gap-1 text-xs text-faint">
                          <KeyIcon className="size-3" />
                          <span className="tabular font-medium">{exam.token}</span>
                        </span>
                      )}
                      {exam.totalGroups > 0 && (
                        <span className="text-xs text-faint">
                          {exam.totalGroups} group
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {exam.isActive ? (
                      <Badge tone="positive">Aktif</Badge>
                    ) : (
                      <Badge tone="neutral">Nonaktif</Badge>
                    )}
                    {isPast(exam.expiredAt) && (
                      <Badge tone="danger" className="ml-1">
                        Kedaluwarsa
                      </Badge>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span className="tabular text-ink-soft">{exam.totalQuestions}</span>
                  </td>
                  <td className="hidden px-4 py-3 text-ink-soft lg:table-cell">
                    {formatDuration(exam.durationMinutes)}
                  </td>
                  <td className="hidden px-4 py-3 text-ink-soft lg:table-cell">
                    {formatDateTime(exam.expiredAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        icon={<UsersIcon className="size-4" />}
                        label="Status peserta"
                        onClick={() => navigate(`/exams/${exam.id}/sessions`)}
                      />
                      <IconButton
                        icon={<FileTextIcon className="size-4" />}
                        label="Kelola soal"
                        onClick={() => navigate(`/exams/${exam.id}`)}
                      />
                      <IconButton
                        icon={<PencilIcon className="size-4" />}
                        label={`Edit ${exam.title}`}
                        onClick={() => openEdit(exam)}
                      />
                      <IconButton
                        icon={<TrashIcon className="size-4" />}
                        label={`Hapus ${exam.title}`}
                        variant="danger"
                        onClick={() => setDeleting(exam)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && exams.length > 0 && totalPages > 1 && (
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

      <ExamFormModal
        open={formOpen}
        exam={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Hapus ujian?"
        message={
          deleting
            ? `Ujian "${deleting.title}" beserta seluruh soal, opsi, dan penetapan group-nya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`
            : ""
        }
        confirmLabel="Hapus ujian"
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
