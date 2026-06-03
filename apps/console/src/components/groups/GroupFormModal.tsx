/**
 * Azhura CBT Console — Group create/edit modal.
 *
 * One form for both create and edit (distinguished by `group`). State resets each
 * time the modal opens so reopening for a different group never shows stale data.
 */

import { useEffect, useState, type FormEvent } from "react";
import { groupsApi } from "../../lib/groups-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import type { GroupSummary } from "../../types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field, Input } from "../ui/Field";

interface GroupFormModalProps {
  open: boolean;
  group?: GroupSummary | null;
  onClose: () => void;
  onSaved: () => void;
}

const MAX_NAME = 30;

export function GroupFormModal({ open, group, onClose, onSaved }: GroupFormModalProps) {
  const isEdit = Boolean(group);
  const [name, setName] = useState(group?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset on each open so a reused (always-mounted) modal never shows stale state.
  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? "");
    setError(null);
    setBusy(false);
  }, [open, group?.id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Nama group wajib diisi.");
      return;
    }

    setBusy(true);
    try {
      if (isEdit && group) {
        await groupsApi.update(group.id, { name: trimmed });
        toast.success("Group diperbarui.");
      } else {
        await groupsApi.create({ name: trimmed });
        toast.success("Group dibuat.");
      }
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal menyimpan group."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={isEdit ? "Edit Group" : "Buat Group"}
      description="Group mewakili kelas/rombel siswa."
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" form="group-form" busy={busy}>
            {isEdit ? "Simpan" : "Buat group"}
          </Button>
        </>
      }
    >
      <form id="group-form" onSubmit={handleSubmit} noValidate>
        <Field label="Nama group" required error={error ?? undefined}>
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Kelas 7A"
              maxLength={MAX_NAME}
              autoFocus
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}
