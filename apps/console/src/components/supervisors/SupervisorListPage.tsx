/**
 * Azhura CBT Console — Supervisor (pengawas) workspace (list) (#140).
 *
 * Mirrors {@link StudentListPage} but simpler: supervisors have no group/batch,
 * so the table is name / NIS / status / created, with row actions for edit,
 * reset password, and delete. Supervisor counts are small, so the full list is
 * fetched once and filtered client-side with a debounced NIS/name search.
 *
 * Deleting a supervisor also drops their exam assignments (FK cascade), so the
 * confirm warning spells that out in plain language.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supervisorsApi } from "../../lib/supervisors-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { useDebounce } from "../../hooks/useDebounce";
import { formatDateTime } from "../../lib/format";
import type { SupervisorAccount } from "../../types";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Input } from "../ui/Field";
import { Spinner, CenterState } from "../ui/Spinner";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { IconButton } from "../ui/IconButton";
import { PageHelpButton } from "../ui/PageHelpButton";
import { SupervisorFormModal } from "./SupervisorFormModal";
import { PlusIcon, SearchIcon, PencilIcon, TrashIcon, KeyIcon, ShieldIcon } from "../ui/icons";

export function SupervisorListPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);

  const [supervisors, setSupervisors] = useState<SupervisorAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupervisorAccount | null>(null);
  const [focusReset, setFocusReset] = useState(false);
  const [deleting, setDeleting] = useState<SupervisorAccount | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await supervisorsApi.listAll();
      setSupervisors(data);
    } catch (err) {
      setError(getErrorMessage(err, "Gagal memuat data pengawas."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return supervisors;
    return supervisors.filter(
      (s) => s.name.toLowerCase().includes(term) || s.nis.toLowerCase().includes(term)
    );
  }, [supervisors, debouncedSearch]);

  function openCreate() {
    setEditing(null);
    setFocusReset(false);
    setFormOpen(true);
  }

  function openEdit(supervisor: SupervisorAccount) {
    setEditing(supervisor);
    setFocusReset(false);
    setFormOpen(true);
  }

  function openReset(supervisor: SupervisorAccount) {
    setEditing(supervisor);
    setFocusReset(true);
    setFormOpen(true);
  }

  function handleSaved() {
    load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await supervisorsApi.remove(deleting.id);
      toast.success("Akun pengawas dihapus.");
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal menghapus akun pengawas."));
      throw err;
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Pengawas</h1>
          <p className="mt-1 text-sm text-faint">
            {supervisors.length > 0
              ? `${supervisors.length} akun pengawas`
              : "Belum ada akun pengawas"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PageHelpButton topic="supervisors" />
          {/* Divider separates the help affordance from the action buttons. */}
          <span className="h-6 w-px bg-line-soft" aria-hidden="true" />
          <Button onClick={openCreate} leadingIcon={<PlusIcon className="size-4" />}>
            Buat akun pengawas
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari NIS atau nama…"
            className="pl-9"
            aria-label="Cari pengawas"
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border-[2.5px] border-[var(--nb-ink)] bg-surface shadow-[3px_3px_0_var(--nb-ink)]">
        {loading ? (
          <CenterState>
            <Spinner className="size-6 text-accent" />
            <span>Memuat pengawas…</span>
          </CenterState>
        ) : error ? (
          <CenterState>
            <span className="text-danger">{error}</span>
            <Button variant="secondary" size="sm" onClick={load}>
              Coba lagi
            </Button>
          </CenterState>
        ) : filtered.length === 0 ? (
          <CenterState>
            <span className="grid size-12 place-items-center rounded-full bg-canvas text-faint">
              <ShieldIcon className="size-6" />
            </span>
            <span>
              {debouncedSearch
                ? "Tidak ada pengawas yang cocok dengan pencarian."
                : "Buat akun pengawas pertama."}
            </span>
            {!debouncedSearch && (
              <Button size="sm" onClick={openCreate} leadingIcon={<PlusIcon className="size-4" />}>
                Buat akun pengawas
              </Button>
            )}
          </CenterState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-[2.5px] border-[var(--nb-ink)] bg-highlight text-left text-xs font-extrabold uppercase tracking-wider text-ink">
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">NIS</th>
                <th className="px-4 py-3">Status</th>
                <th className="hidden px-4 py-3 lg:table-cell">Dibuat</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((supervisor) => (
                <tr
                  key={supervisor.id}
                  className="border-b-[1.5px] border-line-soft transition-colors last:border-0 hover:bg-canvas"
                >
                  <td className="px-4 py-3 font-medium text-ink">{supervisor.name}</td>
                  <td className="px-4 py-3 tabular text-ink-soft">{supervisor.nis}</td>
                  <td className="px-4 py-3">
                    {supervisor.isActive ? (
                      <Badge tone="positive">Aktif</Badge>
                    ) : (
                      <Badge tone="danger">Nonaktif</Badge>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-ink-soft lg:table-cell">
                    {formatDateTime(supervisor.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        icon={<PencilIcon className="size-4" />}
                        label={`Edit ${supervisor.name}`}
                        onClick={() => openEdit(supervisor)}
                      />
                      <IconButton
                        icon={<KeyIcon className="size-4" />}
                        label={`Reset password ${supervisor.name}`}
                        onClick={() => openReset(supervisor)}
                      />
                      <IconButton
                        icon={<TrashIcon className="size-4" />}
                        label={`Hapus ${supervisor.name}`}
                        variant="danger"
                        onClick={() => setDeleting(supervisor)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SupervisorFormModal
        open={formOpen}
        supervisor={editing}
        focusReset={focusReset}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setFocusReset(false);
        }}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Hapus akun pengawas?"
        message={
          deleting
            ? `Akun pengawas "${deleting.name}" (NIS ${deleting.nis}) akan dihapus permanen. Pengawas ini juga akan dilepas dari semua ujian yang ditugaskan. Tindakan ini tidak bisa dibatalkan.`
            : ""
        }
        confirmLabel="Hapus pengawas"
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
