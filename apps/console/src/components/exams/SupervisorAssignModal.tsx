/**
 * Azhura CBT Console — Supervisor assignment modal for an exam (#86).
 *
 * Loads all supervisor accounts and the current assignment for the exam,
 * then shows a searchable checkbox list. On save it diffs the selection and
 * issues only the needed POST/DELETE calls in parallel.
 *
 * `supervisorsApi.listAll()` returns every account (#140), so the picker filters
 * to active supervisors client-side — only active accounts can proctor. When no
 * active account exists yet, the empty state offers a shortcut to create one.
 */

import { useCallback, useEffect, useState } from "react";
import { examsApi } from "../../lib/exams-api";
import { supervisorsApi } from "../../lib/supervisors-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import type { ExamSupervisorDetail, SupervisorAccount } from "../../types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";
import { Spinner, CenterState } from "../ui/Spinner";
import { PlusIcon } from "../ui/icons";
import { SupervisorFormModal } from "../supervisors/SupervisorFormModal";

interface SupervisorAssignModalProps {
  open: boolean;
  examId: string;
  onClose: () => void;
  /** Called after a successful save so the parent can reload its supervisor list. */
  onSaved: (supervisors: ExamSupervisorDetail[]) => void;
}

export function SupervisorAssignModal({
  open,
  examId,
  onClose,
  onSaved,
}: SupervisorAssignModalProps) {
  const [allSupervisors, setAllSupervisors] = useState<SupervisorAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [original, setOriginal] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  /** Refreshes only the supervisor account list (active accounts for the picker). */
  const reloadSupervisors = useCallback(async () => {
    const all = await supervisorsApi.listAll(true);
    setAllSupervisors(all);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setSaving(false);
    setLoading(true);
    setQ("");
    Promise.all([supervisorsApi.listAll(true), examsApi.listSupervisors(examId)])
      .then(([all, assigned]) => {
        if (cancelled) return;
        setAllSupervisors(all);
        const ids = new Set(assigned.map((s) => s.userId));
        setSelected(new Set(ids));
        setOriginal(new Set(ids));
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(getErrorMessage(err, "Gagal memuat data supervisor."));
        // onClose is called via closure but not listed as dep — it is stable
        // enough for this side-effect-only call site.
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
    // onClose intentionally omitted: used only in error branch as a side
    // effect, not as a reactive dependency. Including it would cause a
    // re-fetch loop because ExamDetailPage re-creates the callback reference
    // on every polling tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, examId]);

  const filtered = q.trim()
    ? allSupervisors.filter(
        (s) =>
          s.name.toLowerCase().includes(q.toLowerCase()) ||
          s.nis.includes(q)
      )
    : allSupervisors;

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSave() {
    const toAdd = [...selected].filter((id) => !original.has(id));
    const toRemove = [...original].filter((id) => !selected.has(id));

    if (toAdd.length === 0 && toRemove.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await Promise.all([
        ...toAdd.map((userId) => examsApi.addSupervisor(examId, userId)),
        ...toRemove.map((userId) => examsApi.removeSupervisor(examId, userId)),
      ]);
      const updated = await examsApi.listSupervisors(examId);
      toast.success("Penugasan pengawas diperbarui.");
      onSaved(updated);
      onClose();
    } catch (err) {
      // Re-sync to actual server state so a retry computes the correct diff.
      try {
        const serverState = await examsApi.listSupervisors(examId);
        const ids = new Set(serverState.map((s) => s.userId));
        setSelected(new Set(ids));
        setOriginal(new Set(ids));
      } catch {
        // ignore secondary failure — toast below already surfaces the issue
      }
      toast.error(getErrorMessage(err, "Gagal menyimpan penugasan."));
    } finally {
      setSaving(false);
    }
  }

  const toAddCount = [...selected].filter((id) => !original.has(id)).length;
  const toRemoveCount = [...original].filter((id) => !selected.has(id)).length;
  const hasChanges = toAddCount > 0 || toRemoveCount > 0;

  return (
    <Modal
      open={open}
      title="Kelola Pengawas"
      description="Centang supervisor yang ingin ditugaskan ke ujian ini."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button onClick={handleSave} busy={saving} disabled={saving || loading}>
            Simpan
          </Button>
        </>
      }
    >
      {loading ? (
        <CenterState>
          <Spinner className="size-5 text-accent" />
          <span>Memuat…</span>
        </CenterState>
      ) : allSupervisors.length === 0 ? (
        <CenterState>
          <span>Belum ada akun pengawas yang aktif.</span>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            leadingIcon={<PlusIcon className="size-4" />}
          >
            Buat akun pengawas
          </Button>
        </CenterState>
      ) : (
        <div className="flex flex-col gap-3">
          <Input
            type="search"
            placeholder="Cari nama atau NIS…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {filtered.length === 0 ? (
            <p className="py-2 text-center text-sm text-faint">
              Tidak ada supervisor yang cocok.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {filtered.map((s) => {
                const isChecked = selected.has(s.id);
                return (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-field)] border border-line bg-surface px-3 py-2.5 transition-colors hover:border-faint">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(s.id)}
                        className="focus-ring size-4 shrink-0 accent-[var(--color-accent)]"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-sm font-medium text-ink">{s.name}</span>
                        <span className="text-xs text-faint">{s.nis}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {hasChanges && (
            <p className="text-xs text-faint">
              {toAddCount > 0 && `+${toAddCount} ditambah`}
              {toAddCount > 0 && toRemoveCount > 0 && " · "}
              {toRemoveCount > 0 && `−${toRemoveCount} dilepas`}
            </p>
          )}
        </div>
      )}

      {/* Shortcut: create a supervisor account without leaving the assignment flow. */}
      <SupervisorFormModal
        open={createOpen}
        supervisor={null}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          void reloadSupervisors().catch((err) =>
            toast.error(getErrorMessage(err, "Gagal memuat data pengawas."))
          );
        }}
      />
    </Modal>
  );
}
