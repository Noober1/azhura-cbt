/**
 * Azhura CBT Console — Supervisor (pengawas) create/edit modal (#140).
 *
 * Mirrors {@link StudentFormModal}. Supervisors have no group/batch, so the form
 * is just NIS + name (+ password on create, + active toggle on edit). On a
 * successful create the temporary password is shown once so the operator can hand
 * it to the pengawas. On edit, a separate "Reset password" section issues the
 * dedicated password-reset call and reveals the new temporary password.
 *
 * State resets every time the modal opens to avoid showing stale data or a
 * previously-revealed credential.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { supervisorsApi } from "../../lib/supervisors-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import type {
  CreateSupervisorRequest,
  SupervisorAccount,
  UpdateSupervisorRequest,
} from "../../types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field, Input, Checkbox } from "../ui/Field";
import { CopyIcon, CheckIcon, KeyIcon } from "../ui/icons";

interface SupervisorFormModalProps {
  open: boolean;
  supervisor?: SupervisorAccount | null;
  onClose: () => void;
  /** Called after a successful create/edit so the parent can reload its list. */
  onSaved: () => void;
  /** When true (edit mode), auto-scroll to and focus the reset-password section. */
  focusReset?: boolean;
}

const NIS_MIN = 5;
const NIS_MAX = 20;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 72;

interface FormState {
  nis: string;
  name: string;
  password: string;
  isActive: boolean;
}

function initialState(supervisor?: SupervisorAccount | null): FormState {
  return {
    nis: supervisor?.nis ?? "",
    name: supervisor?.name ?? "",
    password: "",
    isActive: supervisor?.isActive ?? true,
  };
}

type Errors = Partial<Record<"nis" | "name" | "password" | "resetPassword", string>>;

export function SupervisorFormModal({
  open,
  supervisor,
  onClose,
  onSaved,
  focusReset = false,
}: SupervisorFormModalProps) {
  const isEdit = Boolean(supervisor);
  const [form, setForm] = useState<FormState>(() => initialState(supervisor));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  /** Temporary password to reveal after a create/reset, or null. */
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Edit-only: the inline reset-password section.
  const [resetValue, setResetValue] = useState("");
  const [resetting, setResetting] = useState(false);
  const resetSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(initialState(supervisor));
    setErrors({});
    setBusy(false);
    setRevealedPassword(null);
    setCopied(false);
    setResetValue("");
    setResetting(false);
  }, [open, supervisor?.id]);

  // When opened via the row "Reset password" action, bring that section into view.
  useEffect(() => {
    if (!open || !isEdit || !focusReset) return;
    const t = window.setTimeout(
      () => resetSectionRef.current?.scrollIntoView({ block: "center" }),
      50
    );
    return () => window.clearTimeout(t);
  }, [open, isEdit, focusReset]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear a shown error for this field on edit (isActive has no error key).
    if ((errors as Record<string, string | undefined>)[key]) {
      setErrors((e) => ({ ...e, [key]: undefined }));
    }
  }

  function validate(): Errors {
    const found: Errors = {};
    const nis = form.nis.trim();
    if (nis.length < NIS_MIN || nis.length > NIS_MAX) {
      found.nis = `NIS ${NIS_MIN}–${NIS_MAX} karakter.`;
    }
    if (!form.name.trim()) found.name = "Nama wajib diisi.";
    if (!isEdit && form.password.length < PASSWORD_MIN) {
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

    setBusy(true);
    try {
      if (isEdit && supervisor) {
        const payload: UpdateSupervisorRequest = {
          nis: form.nis.trim(),
          name: form.name.trim(),
          isActive: form.isActive,
        };
        await supervisorsApi.update(supervisor.id, payload);
        toast.success("Akun pengawas diperbarui.");
        onSaved();
      } else {
        const payload: CreateSupervisorRequest = {
          nis: form.nis.trim(),
          name: form.name.trim(),
          password: form.password,
        };
        const created = await supervisorsApi.create(payload);
        toast.success("Akun pengawas dibuat.");
        // Keep the modal open to reveal the temporary password once.
        setRevealedPassword(created.initialPassword ?? form.password);
        onSaved();
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal menyimpan akun pengawas."));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    if (!supervisor) return;
    if (resetValue.length < PASSWORD_MIN) {
      setErrors((e) => ({
        ...e,
        resetPassword: `Password minimal ${PASSWORD_MIN} karakter.`,
      }));
      return;
    }
    setResetting(true);
    try {
      const updated = await supervisorsApi.updatePassword(supervisor.id, resetValue);
      toast.success("Password pengawas direset.");
      setRevealedPassword(updated.initialPassword ?? resetValue);
      setResetValue("");
      setErrors((e) => ({ ...e, resetPassword: undefined }));
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal mereset password."));
    } finally {
      setResetting(false);
    }
  }

  async function copyPassword() {
    if (!revealedPassword) return;
    try {
      await navigator.clipboard.writeText(revealedPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Gagal menyalin. Salin manual dari layar.");
    }
  }

  // ── Credential-revealed view (after create / reset) ────────────────────────
  if (revealedPassword) {
    return (
      <Modal
        open={open}
        title="Password pengawas"
        description="Catat atau salin password ini. Password hanya ditampilkan sekali."
        onClose={onClose}
        footer={
          <Button onClick={onClose}>Selesai</Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-field)] border-[2.5px] border-[var(--nb-ink)] bg-highlight px-4 py-3 shadow-[2px_2px_0_var(--nb-ink)]">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              NIS
            </p>
            <p className="tabular text-sm font-medium text-ink">{form.nis.trim()}</p>
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-ink-soft">
              Password
            </p>
            <p className="tabular text-lg font-extrabold tracking-tight text-ink">
              {revealedPassword}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={copyPassword}
            leadingIcon={
              copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />
            }
          >
            {copied ? "Tersalin" : "Salin password"}
          </Button>
          <p className="text-xs text-faint">
            Berikan NIS dan password ini kepada pengawas untuk masuk. Jika lupa,
            Anda dapat mereset password lewat tombol Reset password.
          </p>
        </div>
      </Modal>
    );
  }

  // ── Create / edit form ─────────────────────────────────────────────────────
  return (
    <Modal
      open={open}
      title={isEdit ? "Edit Pengawas" : "Buat Akun Pengawas"}
      description={
        isEdit ? "Perbarui data akun pengawas." : "Buat akun pengawas baru."
      }
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" form="supervisor-form" busy={busy}>
            {isEdit ? "Simpan perubahan" : "Buat akun"}
          </Button>
        </>
      }
    >
      <form
        id="supervisor-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        <Field label="NIS / Username" required error={errors.nis}>
          {(id) => (
            <Input
              id={id}
              value={form.nis}
              onChange={(e) => set("nis", e.target.value)}
              placeholder="pengawas01"
              maxLength={NIS_MAX}
              autoFocus={!focusReset}
              className="tabular"
            />
          )}
        </Field>

        <Field label="Nama lengkap" required error={errors.name}>
          {(id) => (
            <Input
              id={id}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Budi Pengawas"
              maxLength={100}
            />
          )}
        </Field>

        {!isEdit && (
          <Field
            label="Password"
            required
            hint={`Minimal ${PASSWORD_MIN} karakter`}
            error={errors.password}
          >
            {(id) => (
              <Input
                id={id}
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder="Minimal 6 karakter"
                autoComplete="new-password"
                maxLength={PASSWORD_MAX}
              />
            )}
          </Field>
        )}

        {isEdit && (
          <Checkbox
            checked={form.isActive}
            onChange={(v) => set("isActive", v)}
            label="Akun aktif"
            hint="Pengawas nonaktif tidak dapat masuk dan tidak muncul di daftar penugasan."
          />
        )}
      </form>

      {isEdit && (
        <div
          ref={resetSectionRef}
          className="mt-5 flex flex-col gap-3 border-t-[2.5px] border-line-soft pt-4"
        >
          <div className="flex items-center gap-2 text-ink">
            <KeyIcon className="size-4 text-faint" />
            <span className="text-[0.8125rem] font-bold">Reset password</span>
          </div>
          <p className="text-xs text-faint">
            Isi password baru lalu klik Reset. Password lama langsung tidak berlaku.
          </p>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Field label="Password baru" error={errors.resetPassword}>
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    value={resetValue}
                    onChange={(e) => {
                      setResetValue(e.target.value);
                      if (errors.resetPassword) {
                        setErrors((er) => ({ ...er, resetPassword: undefined }));
                      }
                    }}
                    placeholder="Minimal 6 karakter"
                    autoComplete="new-password"
                    autoFocus={focusReset}
                    maxLength={PASSWORD_MAX}
                  />
                )}
              </Field>
            </div>
            <div className="pt-[26px]">
              <Button
                type="button"
                variant="secondary"
                busy={resetting}
                disabled={resetValue.length < PASSWORD_MIN}
                onClick={handleReset}
              >
                Reset
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
