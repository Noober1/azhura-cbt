/**
 * Azhura CBT Console — Students workspace (list).
 *
 * Lists students with debounced NIS/name search, a group filter, and pagination,
 * and is the entry point for student CRUD. Delete is rejected by the backend when
 * the student has exam history; the resulting toast tells the admin to deactivate
 * instead (the confirm dialog stays open so they can switch tactics).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { studentsApi } from "../../lib/students-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { useDebounce } from "../../hooks/useDebounce";
import { useGroups } from "../../hooks/useGroups";
import { formatDateTime } from "../../lib/format";
import { listContainerVariants, rowItemVariants } from "../../lib/motion";
import type { StudentSummary } from "../../types";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Input } from "../ui/Field";
import { Select } from "../ui/Select";
import { Spinner, CenterState } from "../ui/Spinner";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { IconButton } from "../ui/IconButton";
import { StudentFormModal } from "./StudentFormModal";
import { StudentImportModal } from "./StudentImportModal";
import { StudentCardModal } from "./StudentCardModal";
import { PageHelpButton } from "../ui/PageHelpButton";
import {
  PlusIcon,
  SearchIcon,
  PencilIcon,
  TrashIcon,
  UsersIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  UploadIcon,
  PrinterIcon,
} from "../ui/icons";

const PAGE_SIZE = 10;

export function StudentListPage() {
  const { groups } = useGroups();
  const reduce = useReducedMotion() ?? false;
  // Stagger the rows in on the FIRST render of results only. Subsequent loads
  // (search, filter, pagination) re-render the same table — re-staggering then
  // would feel like flicker, so we flip this off after the first paint.
  const hasStaggeredRef = useRef(false);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [groupFilter, setGroupFilter] = useState("");
  const [page, setPage] = useState(1);

  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StudentSummary | null>(null);
  const [deleting, setDeleting] = useState<StudentSummary | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await studentsApi.list({
        q: debouncedSearch.trim() || undefined,
        groupId: groupFilter || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setStudents(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      setError(getErrorMessage(err, "Gagal memuat siswa."));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, groupFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, groupFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Only the first paint of a populated table staggers; after that rows mount
  // plainly so refetch-driven re-renders don't re-animate.
  const showRows = !loading && !error && students.length > 0;
  const staggerNow = showRows && !hasStaggeredRef.current;
  useEffect(() => {
    if (showRows) hasStaggeredRef.current = true;
  }, [showRows]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(student: StudentSummary) {
    setEditing(student);
    setFormOpen(true);
  }

  function handleSaved() {
    setFormOpen(false);
    setEditing(null);
    load();
  }

  // Shared row cells — rendered inside either a motion.tr (first-paint stagger)
  // or a plain tr, so the markup stays in one place.
  function renderStudentCells(student: StudentSummary) {
    return (
      <>
        <td className="px-4 py-3 font-medium text-ink">{student.name}</td>
        <td className="px-4 py-3 tabular text-ink-soft">{student.nis}</td>
        <td className="hidden px-4 py-3 md:table-cell">
          {student.groupName ? (
            <Badge tone="accent">{student.groupName}</Badge>
          ) : (
            <span className="text-faint">—</span>
          )}
        </td>
        <td className="w-16 px-4 py-3 tabular text-ink-soft">{student.batch}</td>
        <td className="px-4 py-3">
          {student.isActive ? (
            <Badge tone="positive">Aktif</Badge>
          ) : (
            <Badge tone="danger">Nonaktif</Badge>
          )}
        </td>
        <td className="hidden px-4 py-3 text-ink-soft lg:table-cell">
          {formatDateTime(student.createdAt)}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            <IconButton
              icon={<PencilIcon className="size-4" />}
              label={`Edit ${student.name}`}
              onClick={() => openEdit(student)}
            />
            <IconButton
              icon={<TrashIcon className="size-4" />}
              label={`Hapus ${student.name}`}
              variant="danger"
              onClick={() => setDeleting(student)}
            />
          </div>
        </td>
      </>
    );
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await studentsApi.remove(deleting.id);
      toast.success("Siswa dihapus.");
      if (students.length === 1 && page > 1) setPage((p) => p - 1);
      else load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal menghapus siswa."));
      throw err;
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Siswa</h1>
          <p className="mt-1 text-sm text-faint">
            {total > 0 ? `${total} siswa` : "Belum ada siswa"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PageHelpButton topic="students" />
          {/* Divider separates the help affordance from the action buttons. */}
          <span className="h-6 w-px bg-line-soft" aria-hidden="true" />
          <Button
            variant="secondary"
            onClick={() => setCardOpen(true)}
            leadingIcon={<PrinterIcon className="size-4" />}
          >
            Cetak Kartu
          </Button>
          <Button
            variant="secondary"
            onClick={() => setImportOpen(true)}
            leadingIcon={<UploadIcon className="size-4" />}
          >
            Import
          </Button>
          <Button onClick={openCreate} leadingIcon={<PlusIcon className="size-4" />}>
            Tambah siswa
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari NIS atau nama…"
            className="pl-9"
            aria-label="Cari siswa"
          />
        </div>
        <div className="w-48">
          <Select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            aria-label="Filter group"
          >
            <option value="">Semua group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border-[2.5px] border-[var(--nb-ink)] bg-surface shadow-[3px_3px_0_var(--nb-ink)]">
        {loading ? (
          <CenterState>
            <Spinner className="size-6 text-accent" />
            <span>Memuat siswa…</span>
          </CenterState>
        ) : error ? (
          <CenterState>
            <span className="text-danger">{error}</span>
            <Button variant="secondary" size="sm" onClick={load}>
              Coba lagi
            </Button>
          </CenterState>
        ) : students.length === 0 ? (
          <CenterState>
            <span className="grid size-12 place-items-center rounded-full bg-canvas text-faint">
              <UsersIcon className="size-6" />
            </span>
            <span>
              {debouncedSearch || groupFilter
                ? "Tidak ada siswa yang cocok dengan filter."
                : "Tambahkan siswa pertama."}
            </span>
            {!debouncedSearch && !groupFilter && (
              <Button size="sm" onClick={openCreate} leadingIcon={<PlusIcon className="size-4" />}>
                Tambah siswa
              </Button>
            )}
          </CenterState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-[2.5px] border-[var(--nb-ink)] bg-highlight text-left text-xs font-extrabold uppercase tracking-wider text-ink">
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">NIS</th>
                <th className="hidden px-4 py-3 md:table-cell">Group</th>
                <th className="w-16 px-4 py-3">Batch</th>
                <th className="px-4 py-3">Status</th>
                <th className="hidden px-4 py-3 lg:table-cell">Dibuat</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            {/* Rows fade/settle in with a tiny stagger on first paint only
                (see `staggerNow`); afterwards they render as plain rows. The
                shared cells live in renderStudentCells to stay DRY across both
                the animated and static branches. Reduced motion drops the
                stagger and the translate via the variant helpers. */}
            {staggerNow ? (
              <motion.tbody
                variants={listContainerVariants(reduce)}
                initial="initial"
                animate="animate"
              >
                {students.map((student) => (
                  <motion.tr
                    key={student.id}
                    variants={rowItemVariants(reduce)}
                    className="border-b-[1.5px] border-line-soft transition-colors last:border-0 hover:bg-canvas"
                  >
                    {renderStudentCells(student)}
                  </motion.tr>
                ))}
              </motion.tbody>
            ) : (
              <tbody>
                {students.map((student) => (
                  <tr
                    key={student.id}
                    className="border-b-[1.5px] border-line-soft transition-colors last:border-0 hover:bg-canvas"
                  >
                    {renderStudentCells(student)}
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        )}
      </div>

      {!loading && !error && students.length > 0 && totalPages > 1 && (
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

      <StudentFormModal
        open={formOpen}
        student={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />

      <StudentImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => { setImportOpen(false); load(); }}
      />

      <StudentCardModal
        open={cardOpen}
        onClose={() => setCardOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Hapus siswa?"
        message={
          deleting
            ? `Akun siswa "${deleting.name}" (NIS ${deleting.nis}) akan dihapus permanen. Jika siswa pernah mengikuti ujian, hapus akan ditolak — nonaktifkan akun sebagai gantinya.`
            : ""
        }
        confirmLabel="Hapus siswa"
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
