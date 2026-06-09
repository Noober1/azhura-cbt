/**
 * Azhura CBT Console — System Settings page (admin only).
 *
 * Lets admins view and edit global application settings grouped into three
 * sections: school identity, exam defaults, and feature toggles. Changes are
 * tracked locally; the "Simpan" button sends only the modified keys as a partial
 * PATCH, keeping unrelated settings untouched.
 */

import { useCallback, useEffect, useState } from "react";
import { settingsApi } from "../../lib/settings-api";
import api from "../../lib/api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import type { SystemSettings } from "../../types";
import { Button } from "../ui/Button";
import { Field, Input, Checkbox } from "../ui/Field";
import { Spinner, CenterState } from "../ui/Spinner";
import { Modal } from "../ui/Modal";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { SettingsIcon } from "../ui/icons";

/** A settings section card with a title and consistent padding. */
function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <div className="mb-5 border-b border-line pb-4">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-faint">{description}</p>
        )}
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [draft, setDraft] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetInput, setResetInput] = useState("");
  const [resetting, setResetting] = useState(false);

  const [wipingMedia, setWipingMedia] = useState(false);
  const [wipingExams, setWipingExams] = useState(false);
  const [wipingStudents, setWipingStudents] = useState(false);
  const [confirmMedia, setConfirmMedia] = useState(false);
  const [confirmExams, setConfirmExams] = useState(false);
  const [confirmStudents, setConfirmStudents] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await settingsApi.get();
      setSettings(data);
      setDraft(data);
    } catch (err) {
      setError(getErrorMessage(err, "Gagal memuat pengaturan."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** True when draft differs from the last saved settings. */
  const isDirty =
    draft !== null &&
    settings !== null &&
    (Object.keys(draft) as (keyof SystemSettings)[]).some(
      (k) => draft[k] !== settings[k]
    );

  function updateDraft<K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!draft || !settings) return;

    // Compute only the keys that changed.
    const patch: Partial<SystemSettings> = {};
    (Object.keys(draft) as (keyof SystemSettings)[]).forEach((k) => {
      if (draft[k] !== settings[k]) {
        (patch as Record<string, unknown>)[k] = draft[k];
      }
    });

    // Guard: nothing changed (e.g. floating-point drift); avoid a spurious round-trip.
    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    try {
      const updated = await settingsApi.update(patch);
      setSettings(updated);
      setDraft(updated);
      toast.success("Pengaturan berhasil disimpan.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal menyimpan pengaturan."));
    } finally {
      setSaving(false);
    }
  }

  async function handleWipeMedia() {
    setWipingMedia(true);
    try {
      await api.delete("/admin/system/media");
      toast.success("Semua media berhasil dihapus.");
      setConfirmMedia(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal menghapus media."));
    } finally {
      setWipingMedia(false);
    }
  }

  async function handleWipeExams() {
    setWipingExams(true);
    try {
      await api.delete("/admin/system/exams");
      toast.success("Semua ujian berhasil dihapus.");
      setConfirmExams(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal menghapus ujian."));
    } finally {
      setWipingExams(false);
    }
  }

  async function handleWipeStudents() {
    setWipingStudents(true);
    try {
      await api.delete("/admin/system/students");
      toast.success("Semua akun siswa berhasil dihapus.");
      setConfirmStudents(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal menghapus akun siswa."));
    } finally {
      setWipingStudents(false);
    }
  }

  function openReset() {
    setResetInput("");
    setResetOpen(true);
  }

  async function handleReset() {
    if (resetInput !== "reset" || resetting) return;
    setResetting(true);
    try {
      await api.post("/admin/system/reset");
      toast.success("Reset sistem berhasil. Halaman akan dimuat ulang...");
      setResetOpen(false);
      // Full reload so SetupGate re-checks /setup/status and shows the wizard.
      await new Promise((r) => setTimeout(r, 1500));
      window.location.replace("/");
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal melakukan reset sistem."));
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <CenterState>
        <Spinner />
        <span>Memuat pengaturan...</span>
      </CenterState>
    );
  }

  if (error || !draft) {
    return (
      <CenterState>
        <SettingsIcon className="size-8 text-faint" />
        <span className="font-medium text-ink">Gagal memuat pengaturan</span>
        <span>{error ?? "Coba muat ulang halaman."}</span>
        <Button variant="secondary" onClick={load}>
          Coba Lagi
        </Button>
      </CenterState>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-ink">Pengaturan Sistem</h1>
        <p className="mt-1 text-sm text-faint">
          Konfigurasi global aplikasi. Perubahan berlaku segera setelah disimpan.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* ── Identitas Sekolah ── */}
        <SettingsSection
          title="Identitas Sekolah"
          description="Nama dan alamat instansi yang ditampilkan di aplikasi."
        >
          <Field label="Nama Sekolah" required>
            {(id) => (
              <Input
                id={id}
                value={draft.schoolName}
                onChange={(e) => updateDraft("schoolName", e.target.value)}
                placeholder="Contoh: SMP Negeri 1 Bandung"
                maxLength={200}
              />
            )}
          </Field>
          <Field label="Alamat">
            {(id) => (
              <Input
                id={id}
                value={draft.schoolAddress}
                onChange={(e) => updateDraft("schoolAddress", e.target.value)}
                placeholder="Contoh: Jl. Merdeka No. 1, Bandung"
                maxLength={500}
              />
            )}
          </Field>
        </SettingsSection>

        {/* ── Default Ujian ── */}
        <SettingsSection
          title="Default Ujian"
          description="Nilai awal yang diisi otomatis saat admin membuat ujian baru."
        >
          <Field
            label="Durasi Default (menit)"
            hint="Rentang yang valid: 1–480 menit."
          >
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={480}
                value={draft.defaultExamDurationMinutes}
                onChange={(e) =>
                  updateDraft(
                    "defaultExamDurationMinutes",
                    Math.min(480, Math.max(1, Number(e.target.value) || 1))
                  )
                }
                className="max-w-[12rem]"
              />
            )}
          </Field>
          <Field
            label="Passing Grade Default (%)"
            hint="Nilai minimum kelulusan (0–100)."
          >
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                max={100}
                value={draft.defaultPassingGrade}
                onChange={(e) =>
                  updateDraft(
                    "defaultPassingGrade",
                    Math.min(100, Math.max(0, Number(e.target.value) || 0))
                  )
                }
                className="max-w-[12rem]"
              />
            )}
          </Field>
        </SettingsSection>

        {/* ── Fitur ── */}
        <SettingsSection
          title="Fitur"
          description="Aktifkan atau nonaktifkan fitur sistem secara global."
        >
          <Checkbox
            checked={draft.antiCheatEnabled}
            onChange={(checked) => updateDraft("antiCheatEnabled", checked)}
            label="Aktifkan Anti-Cheat"
            hint="Memantau kecurangan siswa (focus loss, shortcut, fullscreen) selama ujian berlangsung."
          />
          <Checkbox
            checked={draft.chatEnabled}
            onChange={(checked) => updateDraft("chatEnabled", checked)}
            label="Aktifkan Chat Publik"
            hint="Ruang obrolan publik siswa di dashboard (di luar ujian), dengan anti-spam dan pengumuman."
          />
        </SettingsSection>

        {/* ── Zona Berbahaya ── */}
        <section className="rounded-xl border border-danger/40 bg-danger-wash/30 p-6">
          <div className="mb-5 border-b border-danger/20 pb-4">
            <h2 className="text-base font-semibold text-danger">Zona Berbahaya</h2>
            <p className="mt-1 text-sm text-faint">
              Tindakan di bawah ini bersifat permanen dan tidak dapat dibatalkan.
            </p>
          </div>
          <div className="flex flex-col divide-y divide-danger/10">
            <div className="flex items-center justify-between gap-4 pb-4">
              <div>
                <p className="text-sm font-medium text-ink">Hapus semua gallery</p>
                <p className="mt-0.5 text-sm text-faint">
                  Hapus semua file media (gambar, audio, video) beserta file fisiknya dari disk.
                  Soal yang mereferensikan media ini akan kehilangan lampiran.
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setConfirmMedia(true)}>
                Hapus Gallery
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="text-sm font-medium text-ink">Hapus semua ujian</p>
                <p className="mt-0.5 text-sm text-faint">
                  Hapus seluruh ujian, soal, sesi, dan jawaban. Akun siswa dan media tidak terpengaruh.
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setConfirmExams(true)}>
                Hapus Ujian
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="text-sm font-medium text-ink">Hapus semua siswa</p>
                <p className="mt-0.5 text-sm text-faint">
                  Hapus seluruh akun siswa beserta sesi ujian dan riwayat chat mereka.
                  Ujian, soal, dan media tidak terpengaruh.
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setConfirmStudents(true)}>
                Hapus Siswa
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4 pt-4">
              <div>
                <p className="text-sm font-medium text-ink">Reset Sistem</p>
                <p className="mt-0.5 text-sm text-faint">
                  Hapus seluruh data termasuk semua akun pengguna. Setelah reset,
                  wizard setup awal akan muncul kembali untuk membuat akun admin baru.
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={openReset}>
                Reset Sistem
              </Button>
            </div>
          </div>
        </section>
      </div>

      {/* Footer actions */}
      <div className="mt-8 flex items-center justify-end gap-3 border-t border-line pt-6">

        <Button
          variant="ghost"
          onClick={() => setDraft(settings)}
          disabled={!isDirty || saving}
        >
          Batalkan
        </Button>
        <Button onClick={() => void handleSave()} disabled={!isDirty || saving} busy={saving}>
          Simpan Perubahan
        </Button>
      </div>

      <ConfirmDialog
        open={confirmMedia}
        title="Hapus semua gallery?"
        message="Semua file media (gambar, audio, video) beserta file fisiknya akan dihapus permanen. Soal yang mereferensikan media ini akan kehilangan lampiran."
        confirmLabel={wipingMedia ? "Menghapus…" : "Hapus semua media"}
        tone="danger"
        onConfirm={() => void handleWipeMedia()}
        onClose={() => setConfirmMedia(false)}
      />

      <ConfirmDialog
        open={confirmExams}
        title="Hapus semua ujian?"
        message="Seluruh ujian, soal, pilihan jawaban, sesi, dan jawaban siswa akan dihapus permanen. Akun siswa dan media tidak terpengaruh."
        confirmLabel={wipingExams ? "Menghapus…" : "Hapus semua ujian"}
        tone="danger"
        onConfirm={() => void handleWipeExams()}
        onClose={() => setConfirmExams(false)}
      />

      <ConfirmDialog
        open={confirmStudents}
        title="Hapus semua siswa?"
        message="Seluruh akun siswa beserta sesi ujian dan riwayat chat mereka akan dihapus permanen. Ujian, soal, dan media tidak terpengaruh."
        confirmLabel={wipingStudents ? "Menghapus…" : "Hapus semua siswa"}
        tone="danger"
        onConfirm={() => void handleWipeStudents()}
        onClose={() => setConfirmStudents(false)}
      />

      {/* Reset confirmation modal */}
      <Modal
        open={resetOpen}
        title="Konfirmasi Reset Sistem"
        description="Tindakan ini tidak dapat dibatalkan. Seluruh database akan dikosongkan dan semua akun dihapus."
        onClose={() => { if (!resetting) setResetOpen(false); }}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)} disabled={resetting}>
              Batal
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleReset()}
              disabled={resetInput !== "reset" || resetting}
              busy={resetting}
            >
              Reset Sekarang
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink">
            Data berikut akan dihapus secara permanen:
          </p>
          <ul className="list-disc pl-5 text-sm text-faint space-y-1">
            <li>Semua ujian, soal, dan pilihan jawaban</li>
            <li>Semua sesi ujian dan jawaban siswa</li>
            <li>Semua akun pengguna — siswa, pengawas, dan <strong>admin</strong></li>
            <li>Semua kelompok, riwayat chat, dan log aplikasi</li>
          </ul>
          <p className="text-sm text-faint rounded-lg border border-line bg-canvas px-3 py-2">
            Setelah reset, wizard setup awal akan muncul untuk membuat akun admin baru.
            Pengaturan sistem (nama sekolah, dll.) tetap dipertahankan.
          </p>
          <Field label="Ketik 'reset' untuk mengkonfirmasi">
            {(id) => (
              <Input
                id={id}
                value={resetInput}
                onChange={(e) => setResetInput(e.target.value)}
                placeholder="reset"
                autoComplete="off"
                disabled={resetting}
              />
            )}
          </Field>
        </div>
      </Modal>
    </div>
  );
}
