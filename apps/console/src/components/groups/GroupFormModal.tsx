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
const MAX_CODE = 6;

export function GroupFormModal({ open, group, onClose, onSaved }: GroupFormModalProps) {
  const isEdit = Boolean(group);
  const [name, setName] = useState(group?.name ?? "");
  const [code, setCode] = useState(group?.code ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset on each open so a reused (always-mounted) modal never shows stale state.
  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? "");
    setCode(group?.code ?? "");
    setNameError(null);
    setCodeError(null);
    setBusy(false);
  }, [open, group?.id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();
    let valid = true;
    if (!trimmedName) {
      setNameError("Nama group wajib diisi.");
      valid = false;
    }
    if (!trimmedCode) {
      setCodeError("Kode group wajib diisi.");
      valid = false;
    }
    if (!valid) return;

    setBusy(true);
    try {
      if (isEdit && group) {
        await groupsApi.update(group.id, { name: trimmedName, code: trimmedCode });
        toast.success("Group diperbarui.");
      } else {
        await groupsApi.create({ name: trimmedName, code: trimmedCode });
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
      <form id="group-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Nama group" required error={nameError ?? undefined}>
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="Kelas 7A"
              maxLength={MAX_NAME}
              autoFocus
            />
          )}
        </Field>
        <Field
          label="Kode"
          required
          error={codeError ?? undefined}
          hint="Maks. 6 karakter. Akan disimpan sebagai huruf kapital."
        >
          {(id) => (
            <Input
              id={id}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                if (codeError) setCodeError(null);
              }}
              placeholder="7A"
              maxLength={MAX_CODE}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}
