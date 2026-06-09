/**
 * Azhura CBT Console — Exam create/edit modal.
 *
 * One form for both create and edit (distinguished by `exam`). Validates locally
 * (mirroring the backend's token + duration rules) before calling the API, then
 * reports success via toast and hands the saved exam back to the caller.
 *
 * Group assignment (`allowedGroups`) is wired now that the groups admin API
 * exists (#15): only students in the selected groups may see/start the exam. When
 * editing from the list (a summary without `allowedGroups`), the current
 * assignment is fetched on open so checkboxes prefill correctly.
 *
 * State resets every time the modal opens, so reusing the (always-mounted) modal
 * for a different exam never shows stale data.
 */

import { useEffect, useState, type FormEvent } from "react";
import { examsApi } from "../../lib/exams-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { useGroups } from "../../hooks/useGroups";
import { useSettings } from "../../hooks/useSettings";
import { fromDatetimeLocal, toDatetimeLocal } from "../../lib/format";
import type { AdminGroupRef, ExamDetail, ExamSummary } from "../../types";
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

// Selectable exam batches (#76). The backend accepts integers 1–10; an empty
// selection means "open to all batches".
const BATCH_NUMBERS = Array.from({ length: 10 }, (_, i) => i + 1);

interface FormState {
  title: string;
  durationMinutes: string;
  expiredAt: string;
  token: string;
  passingGrade: string;
  isActive: boolean;
  randomizeQuestion: boolean;
  randomizeAnswer: boolean;
}

function initialState(exam?: ExamSummary | ExamDetail | null, defaultPassingGrade = 0): FormState {
  if (exam) {
    return {
      title: exam.title,
      durationMinutes: String(exam.durationMinutes),
      expiredAt: toDatetimeLocal(exam.expiredAt),
      token: exam.token ?? "",
      passingGrade: String(exam.passingGrade),
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
    passingGrade: String(defaultPassingGrade),
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
  const pg = Number(form.passingGrade);
  if (!Number.isInteger(pg) || pg < 0 || pg > 100) {
    errors.passingGrade = "Passing grade antara 0–100.";
  }
  return errors;
}

export function ExamFormModal({ open, exam, onClose, onSaved }: ExamFormModalProps) {
  const isEdit = Boolean(exam);
  const { groups } = useGroups(open);
  const { settings } = useSettings(open && !isEdit);
  const [form, setForm] = useState<FormState>(() => initialState(exam));
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  // Allowed batch numbers (#76). Empty = open to all batches.
  const [selectedBatches, setSelectedBatches] = useState<number[]>([]);
  // groupId -> active participant count, for groups locked because students are
  // mid-exam (#29). Such groups can't be unchecked/removed.
  const [lockedGroups, setLockedGroups] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  // When settings load (async) while creating a new exam, pre-fill passingGrade
  // only if the user hasn't changed it from the initial "0" placeholder.
  useEffect(() => {
    if (!open || isEdit || !settings) return;
    setForm((f) => ({
      ...f,
      passingGrade: f.passingGrade === "0"
        ? String(settings.defaultPassingGrade)
        : f.passingGrade,
    }));
  }, [settings, open, isEdit]);

  // Reset form + group selection each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setForm(initialState(exam, settings?.defaultPassingGrade ?? 0));
    setErrors({});
    setBusy(false);

    const applyAllowed = (allowed: AdminGroupRef[]) => {
      setSelectedGroupIds(allowed.map((g) => g.id));
      const locks: Record<string, number> = {};
      for (const g of allowed) {
        if (g.activeParticipants > 0) locks[g.id] = g.activeParticipants;
      }
      setLockedGroups(locks);
    };

    // `batches` is present on both summary and detail shapes, so prefill it
    // synchronously without waiting for the detail fetch.
    setSelectedBatches(exam?.batches ?? []);

    let cancelled = false;
    if (!exam) {
      setSelectedGroupIds([]);
      setLockedGroups({});
    } else if ("allowedGroups" in exam) {
      applyAllowed(exam.allowedGroups);
    } else {
      // Editing from a list row (summary, no group detail) — fetch it.
      setSelectedGroupIds([]);
      setLockedGroups({});
      examsApi
        .get(exam.id)
        .then((detail) => {
          if (!cancelled) applyAllowed(detail.allowedGroups);
        })
        .catch(() => {
          /* leave empty; the list still saves other fields fine */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open, exam?.id]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function toggleGroup(id: string) {
    if (lockedGroups[id] !== undefined) return; // locked: cannot be removed (#29)
    setSelectedGroupIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    );
  }

  function toggleBatch(n: number) {
    setSelectedBatches((batches) =>
      batches.includes(n)
        ? batches.filter((x) => x !== n)
        : [...batches, n].sort((a, b) => a - b)
    );
  }

  function toggleAllGroups(selectAll: boolean) {
    // Deselect-all keeps locked groups selected — they can't be removed.
    setSelectedGroupIds(
      selectAll ? groups.map((g) => g.id) : Object.keys(lockedGroups)
    );
  }

  // An exam with no questions cannot be activated (enforced by the backend too).
  // Count comes from the detail's questions array, or a summary's totalQuestions;
  // a not-yet-created exam has none.
  const questionCount = exam
    ? "questions" in exam
      ? exam.questions.length
      : exam.totalQuestions
    : 0;
  const canActivate = questionCount > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate(form);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    if (form.isActive && !canActivate) {
      toast.error("Tidak bisa mengaktifkan ujian tanpa soal. Tambahkan minimal 1 soal.");
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
      passingGrade: Number(form.passingGrade),
      allowedGroups: selectedGroupIds,
      batches: selectedBatches,
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
            label="Passing grade (%)"
            hint="0 = semua peserta dianggap lulus"
            error={errors.passingGrade}
          >
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                max={100}
                value={form.passingGrade}
                onChange={(e) => set("passingGrade", e.target.value)}
                className="tabular"
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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

        {/* Group assignment */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.8125rem] font-medium text-ink">
              Group yang diizinkan
            </span>
            {groups.length > 0 && (
              <span className="text-xs tabular text-faint">
                {selectedGroupIds.length}/{groups.length} dipilih
              </span>
            )}
          </div>

          {groups.length === 0 ? (
            <p className="rounded-[var(--radius-field)] border border-line bg-canvas px-3 py-2 text-xs text-faint">
              Belum ada group. Buat di menu <span className="font-medium">Group</span>{" "}
              untuk menetapkannya ke ujian.
            </p>
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-line">
              {/* Fixed select-all header (indeterminate when partially selected). */}
              <label className="flex cursor-pointer items-center gap-2 border-b border-line bg-canvas px-3 py-2.5 transition-colors hover:bg-canvas/60">
                <input
                  type="checkbox"
                  ref={(el) => {
                    if (el) {
                      el.indeterminate =
                        selectedGroupIds.length > 0 &&
                        selectedGroupIds.length < groups.length;
                    }
                  }}
                  checked={selectedGroupIds.length === groups.length}
                  onChange={(e) => toggleAllGroups(e.target.checked)}
                  className="focus-ring size-4 accent-[var(--color-accent)]"
                />
                <span className="text-sm font-medium text-ink">Semua group</span>
                <span className="ml-auto text-xs tabular text-faint">
                  {groups.length} group
                </span>
              </label>

              {/* Scroll body — fixed height so a large group list never blows up
                  the modal; the grid inside reflows to 2–3 columns. */}
              <div className="max-h-52 overflow-y-auto bg-surface p-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {groups.map((g) => {
                    const checked = selectedGroupIds.includes(g.id);
                    const lockedCount = lockedGroups[g.id];
                    const locked = lockedCount !== undefined;
                    return (
                      <label
                        key={g.id}
                        title={
                          locked
                            ? `${lockedCount} siswa sedang mengerjakan — group tidak dapat dikeluarkan`
                            : undefined
                        }
                        className={`flex items-center gap-2 rounded-[var(--radius-field)] border px-3 py-2 transition-colors ${
                          locked
                            ? "cursor-not-allowed border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10"
                            : checked
                              ? "cursor-pointer border-accent/40 bg-accent-wash"
                              : "cursor-pointer border-line bg-surface hover:border-faint"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked}
                          onChange={() => toggleGroup(g.id)}
                          className="focus-ring size-4 accent-[var(--color-accent)] disabled:cursor-not-allowed"
                        />
                        <span className="truncate text-sm text-ink">{g.name}</span>
                        {locked ? (
                          <span className="ml-auto whitespace-nowrap text-xs font-medium text-[var(--color-warn)]">
                            {lockedCount} mengerjakan
                          </span>
                        ) : (
                          <span className="ml-auto text-xs tabular text-faint">{g.memberCount}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-faint">
            Hanya siswa pada group terpilih yang dapat melihat &amp; memulai ujian ini.
          </p>
          {Object.keys(lockedGroups).length > 0 && (
            <p className="text-xs font-medium text-[var(--color-warn)]">
              Group bertanda kuning sedang dikerjakan siswa dan terkunci — tidak
              dapat dikeluarkan sampai mereka selesai.
            </p>
          )}
        </div>

        {/* Batch restriction (#76) */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.8125rem] font-medium text-ink">
              Batch yang diizinkan
            </span>
            {selectedBatches.length > 0 && (
              <span className="text-xs tabular text-faint">
                {selectedBatches.length} dipilih
              </span>
            )}
          </div>

          <div className="grid grid-cols-5 gap-2">
            {BATCH_NUMBERS.map((n) => {
              const checked = selectedBatches.includes(n);
              return (
                <label
                  key={n}
                  className={`flex cursor-pointer items-center gap-2 rounded-[var(--radius-field)] border px-2.5 py-2 transition-colors ${
                    checked
                      ? "border-accent/40 bg-accent-wash"
                      : "border-line bg-surface hover:border-faint"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBatch(n)}
                    className="focus-ring size-4 accent-[var(--color-accent)]"
                  />
                  <span className="text-sm text-ink">Batch {n}</span>
                </label>
              );
            })}
          </div>

          <p className="text-xs text-faint">
            {selectedBatches.length === 0
              ? "Semua batch dapat mengikuti ujian ini."
              : "Hanya siswa pada batch terpilih yang dapat mengikuti ujian ini."}
          </p>
        </div>

        <div className="flex flex-col gap-2.5 pt-1">
          <Checkbox
            checked={form.isActive}
            onChange={(v) => set("isActive", v)}
            label="Aktif"
            disabled={!canActivate && !form.isActive}
            hint={
              canActivate
                ? "Siswa pada group yang diizinkan dapat melihat & memulai ujian."
                : "Tambahkan minimal 1 soal untuk mengaktifkan ujian."
            }
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
      </form>
    </Modal>
  );
}
