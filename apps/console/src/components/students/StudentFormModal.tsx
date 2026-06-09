/**
 * Azhura CBT Console — Student create/edit modal.
 *
 * One form for both create and edit. On edit, the password field is optional
 * (left blank = unchanged). Group options load each time the modal opens (so a
 * group created elsewhere appears). State resets on open to avoid stale data.
 */

import { useEffect, useState, type FormEvent } from "react";
import { studentsApi } from "../../lib/students-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { useGroups } from "../../hooks/useGroups";
import type { StudentSummary, StudentCreateInput, StudentUpdateInput } from "../../types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field, Input, Checkbox } from "../ui/Field";
import { Select } from "../ui/Select";

interface StudentFormModalProps {
  open: boolean;
  student?: StudentSummary | null;
  onClose: () => void;
  onSaved: () => void;
}

const NIS_MIN = 5;
const NIS_MAX = 20;
const PASSWORD_MIN = 6;
const BATCH_MIN = 1;
const BATCH_MAX = 10;
const BATCH_DEFAULT = 1;
const BATCH_OPTIONS = Array.from({ length: BATCH_MAX }, (_, i) => i + BATCH_MIN);

interface FormState {
  nis: string;
  name: string;
  password: string;
  groupId: string; // "" = no group
  batch: number;
  isActive: boolean;
}

function initialState(student?: StudentSummary | null): FormState {
  return {
    nis: student?.nis ?? "",
    name: student?.name ?? "",
    password: "",
    groupId: student?.groupId ?? "",
    batch: student?.batch ?? BATCH_DEFAULT,
    isActive: student?.isActive ?? true,
  };
}

type Errors = Partial<Record<keyof FormState, string>>;

export function StudentFormModal({ open, student, onClose, onSaved }: StudentFormModalProps) {
  const isEdit = Boolean(student);
  const { groups } = useGroups(open);
  const [form, setForm] = useState<FormState>(() => initialState(student));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initialState(student));
    setErrors({});
    setBusy(false);
  }, [open, student?.id]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): Errors {
    const found: Errors = {};
    const nis = form.nis.trim();
    if (nis.length < NIS_MIN || nis.length > NIS_MAX) {
      found.nis = `NIS ${NIS_MIN}–${NIS_MAX} karakter.`;
    }
    if (!form.name.trim()) found.name = "Nama wajib diisi.";
    // Password required on create; on edit only validated when provided.
    if (!isEdit && form.password.length < PASSWORD_MIN) {
      found.password = `Password minimal ${PASSWORD_MIN} karakter.`;
    } else if (isEdit && form.password && form.password.length < PASSWORD_MIN) {
      found.password = `Password minimal ${PASSWORD_MIN} karakter.`;
    }
    return found;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    const groupId = form.groupId === "" ? null : form.groupId;

    setBusy(true);
    try {
      if (isEdit && student) {
        const payload: StudentUpdateInput = {
          nis: form.nis.trim(),
          name: form.name.trim(),
          groupId,
          batch: form.batch,
          isActive: form.isActive,
        };
        if (form.password) payload.password = form.password;
        await studentsApi.update(student.id, payload);
        toast.success("Siswa diperbarui.");
      } else {
        const payload: StudentCreateInput = {
          nis: form.nis.trim(),
          name: form.name.trim(),
          password: form.password,
          groupId,
          batch: form.batch,
          isActive: form.isActive,
        };
        await studentsApi.create(payload);
        toast.success("Siswa ditambahkan.");
      }
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal menyimpan siswa."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={isEdit ? "Edit Siswa" : "Tambah Siswa"}
      description={isEdit ? "Perbarui data akun siswa." : "Buat akun siswa baru."}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" form="student-form" busy={busy}>
            {isEdit ? "Simpan perubahan" : "Tambah siswa"}
          </Button>
        </>
      }
    >
      <form id="student-form" onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="NIS" required error={errors.nis}>
            {(id) => (
              <Input
                id={id}
                value={form.nis}
                onChange={(e) => set("nis", e.target.value)}
                placeholder="12345"
                maxLength={NIS_MAX}
                autoFocus
                className="tabular"
              />
            )}
          </Field>

          <Field label="Group" hint="Opsional">
            {(id) => (
              <Select
                id={id}
                value={form.groupId}
                onChange={(e) => set("groupId", e.target.value)}
              >
                <option value="">Tanpa group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Batch" required>
            {(id) => (
              <Select
                id={id}
                value={String(form.batch)}
                onChange={(e) => set("batch", Number(e.target.value))}
              >
                {BATCH_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Field label="Nama lengkap" required error={errors.name}>
          {(id) => (
            <Input
              id={id}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ahmad Faisal"
              maxLength={100}
            />
          )}
        </Field>

        <Field
          label={isEdit ? "Password baru" : "Password"}
          required={!isEdit}
          hint={isEdit ? "Kosongkan jika tidak diubah" : `Minimal ${PASSWORD_MIN} karakter`}
          error={errors.password}
        >
          {(id) => (
            <Input
              id={id}
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder={isEdit ? "••••••••" : "Minimal 6 karakter"}
              autoComplete="new-password"
              maxLength={72}
            />
          )}
        </Field>

        <Checkbox
          checked={form.isActive}
          onChange={(v) => set("isActive", v)}
          label="Akun aktif"
          hint="Siswa nonaktif tidak dapat login."
        />
      </form>
    </Modal>
  );
}
