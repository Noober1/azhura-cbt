/**
 * Azhura CBT Console — Exam create/edit modal.
 *
 * One form for both create and edit (distinguished by `exam`). Validates locally
 * (mirroring the backend's token + duration rules) before calling the API, then
 * reports success via toast and hands the saved exam back to the caller.
 *
 * Note: group assignment (`allowedGroups`) is intentionally omitted until the
 * groups admin API lands in #15 — there is no endpoint to enumerate groups yet.
 */

import { useState, type FormEvent } from "react";
import { examsApi } from "../../lib/exams-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { fromDatetimeLocal, toDatetimeLocal } from "../../lib/format";
import type { ExamDetail, ExamSummary } from "../../types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field, Input, Checkbox } from "../ui/Field";

interface ExamFormModalProps {
  open: boolean;
  /** When provided, the form edits this exam; otherwise it creates a new one. */
  exam?: ExamSummary | ExamDetail | null;
  onClose: () => void;
  onSaved: (exam: ExamDetail) => void;
}

const TOKEN_REGEX = /^[A-Za-z0-9]{1,5}$/;

// Default new-exam expiry: 7 days out, keeps the picker non-empty and sensible.
const DEFAULT_EXPIRY_OFFSET_MS = 7 * 24 * 60 * 60 * 1000;

interface FormState {
  title: string;
  durationMinutes: string;
  expiredAt: string;
  token: string;
  isActive: boolean;
  randomizeQuestion: boolean;
  randomizeAnswer: boolean;
}

function initialState(exam?: ExamSummary | ExamDetail | null): FormState {
  if (exam) {
    return {
      title: exam.title,
      durationMinutes: String(exam.durationMinutes),
      expiredAt: toDatetimeLocal(exam.expiredAt),
      token: exam.token ?? "",
      isActive: exam.isActive,
      randomizeQuestion: exam.randomizeQuestion,
      randomizeAnswer: exam.randomizeAnswer,
    };
  }
  return {
    title: "",
    durationMinutes: "60",
    expiredAt: toDatetimeLocal(Date.now() + DEFAULT_EXPIRY_OFFSET_MS),
    token: "",
    isActive: false,
    randomizeQuestion: true,
    randomizeAnswer: true,
  };
}

type Errors = Partial<Record<keyof FormState, string>>;

function validate(form: FormState): Errors {
  const errors: Errors = {};
  if (!form.title.trim()) errors.title = "Judul wajib diisi.";
  const dur = Number(form.durationMinutes);
  if (!Number.isInteger(dur) || dur < 1) {
    errors.durationMinutes = "Durasi minimal 1 menit.";
  }
  if (!form.expiredAt || Number.isNaN(fromDatetimeLocal(form.expiredAt))) {
    errors.expiredAt = "Waktu kedaluwarsa wajib diisi.";
  }
  if (form.token && !TOKEN_REGEX.test(form.token)) {
    errors.token = "Token 1–5 karakter alfanumerik (huruf/angka).";
  }
  return errors;
}

export function ExamFormModal({ open, exam, onClose, onSaved }: ExamFormModalProps) {
  const isEdit = Boolean(exam);
  const [form, setForm] = useState<FormState>(() => initialState(exam));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate(form);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    const payload = {
      title: form.title.trim(),
      durationMinutes: Number(form.durationMinutes),
      expiredAt: fromDatetimeLocal(form.expiredAt),
      token: form.token.trim() === "" ? null : form.token.trim(),
      isActive: form.isActive,
      randomizeQuestion: form.randomizeQuestion,
      randomizeAnswer: form.randomizeAnswer,
    };

    setBusy(true);
    try {
      const saved =
        isEdit && exam
          ? await examsApi.update(exam.id, payload)
          : await examsApi.create(payload);
      toast.success(isEdit ? "Ujian diperbarui." : "Ujian dibuat.");
      onSaved(saved);
    } catch (error) {
      toast.error(getErrorMessage(error, "Gagal menyimpan ujian."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={isEdit ? "Edit Ujian" : "Buat Ujian"}
      description={
        isEdit
          ? "Perbarui detail paket ujian."
          : "Buat paket ujian baru, lalu tambahkan soal."
      }
      onClose={busy ? () => {} : onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" form="exam-form" busy={busy}>
            {isEdit ? "Simpan perubahan" : "Buat ujian"}
          </Button>
        </>
      }
    >
      <form id="exam-form" onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Judul ujian" required error={errors.title}>
          {(id) => (
            <Input
              id={id}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Ujian Akhir Semester — Matematika"
              autoFocus
              maxLength={200}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Durasi (menit)" required error={errors.durationMinutes}>
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                value={form.durationMinutes}
                onChange={(e) => set("durationMinutes", e.target.value)}
                className="tabular"
              />
            )}
          </Field>

          <Field
            label="Token akses"
            hint="Opsional · 1–5 karakter, huruf/angka"
            error={errors.token}
          >
            {(id) => (
              <Input
                id={id}
                value={form.token}
                onChange={(e) => set("token", e.target.value)}
                placeholder="A1B2"
                maxLength={5}
              />
            )}
          </Field>
        </div>

        <Field label="Kedaluwarsa" required error={errors.expiredAt}>
          {(id) => (
            <Input
              id={id}
              type="datetime-local"
              value={form.expiredAt}
              onChange={(e) => set("expiredAt", e.target.value)}
              className="tabular"
            />
          )}
        </Field>

        <div className="flex flex-col gap-2.5 pt-1">
          <Checkbox
            checked={form.isActive}
            onChange={(v) => set("isActive", v)}
            label="Aktif"
            hint="Siswa pada group yang diizinkan dapat melihat & memulai ujian."
          />
          <Checkbox
            checked={form.randomizeQuestion}
            onChange={(v) => set("randomizeQuestion", v)}
            label="Acak urutan soal"
          />
          <Checkbox
            checked={form.randomizeAnswer}
            onChange={(v) => set("randomizeAnswer", v)}
            label="Acak urutan opsi jawaban"
          />
        </div>

        <p className="rounded-[var(--radius-field)] border border-line bg-canvas px-3 py-2 text-xs text-faint">
          Penetapan group siswa akan tersedia bersama modul Siswa &amp; Group (#15).
        </p>
      </form>
    </Modal>
  );
}
