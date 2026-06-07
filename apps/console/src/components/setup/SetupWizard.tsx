/**
 * Azhura CBT Console — First-run Setup Wizard.
 *
 * Shown by <SetupGate> only when the backend reports no admin account exists
 * (`GET /setup/status` → needsSetup). Collects school info + the first admin's
 * credentials, posts them to `/setup`, then auto-logs-in with those credentials
 * so the operator lands straight in the workspace. Mirrors the LoginPage's
 * editorial split layout for visual continuity.
 */

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { setupApi } from "../../lib/setup-api";
import { useAuthStore } from "../../stores/auth";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { Button } from "../ui/Button";
import { Field, Input, Checkbox } from "../ui/Field";
import { ShieldIcon } from "../ui/icons";

const MIN_NIS_LENGTH = 5;
const MIN_PASSWORD_LENGTH = 6;

interface SetupWizardProps {
  /** Called once setup succeeds, so the gate can hand off to the app router. */
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [schoolName, setSchoolName] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminNis, setAdminNis] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [chatEnabled, setChatEnabled] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Returns a client-side validation message, or null when the form is valid. */
  function validate(): string | null {
    if (!schoolName.trim()) return "Nama sekolah wajib diisi.";
    if (!adminName.trim()) return "Nama admin wajib diisi.";
    if (adminNis.trim().length < MIN_NIS_LENGTH)
      return `NIS/username admin minimal ${MIN_NIS_LENGTH} karakter.`;
    if (password.length < MIN_PASSWORD_LENGTH)
      return `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`;
    if (password !== passwordConfirm) return "Konfirmasi password tidak cocok.";
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);
    const nis = adminNis.trim();
    try {
      await setupApi.submit({
        schoolName: schoolName.trim(),
        schoolAddress: schoolAddress.trim() || undefined,
        adminName: adminName.trim(),
        adminNis: nis,
        adminPassword: password,
        chatEnabled,
      });

      // Auto-login with the just-created credentials so setup flows straight
      // into the workspace without a second sign-in.
      const ok = await login(nis, password);
      // Hand off to the app router either way: setup is done, so the gate must
      // stop rendering the wizard.
      onComplete();
      if (ok) {
        toast.success("Setup selesai. Selamat datang di Azhura CBT.");
        navigate("/exams", { replace: true });
        return;
      }
      // Setup succeeded but auto-login failed (unexpected) — send them to login.
      toast.success("Setup selesai. Silakan masuk dengan akun admin Anda.");
      navigate("/login", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, "Setup gagal. Coba lagi."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-rail p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full opacity-30 blur-3xl"
          style={{ background: "var(--color-accent)" }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
            <ShieldIcon className="size-5" />
          </span>
          <span className="text-sm font-semibold tracking-wide">Azhura CBT</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Selamat datang
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-rail-soft">
            Ini pertama kalinya sistem dijalankan. Buat akun administrator dan
            isi identitas sekolah untuk mulai mengelola ujian.
          </p>
        </div>

        <p className="relative text-xs text-rail-soft">
          Computer-Based Test · Pengaturan Awal
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Pengaturan Awal
            </h2>
            <p className="mt-1 text-sm text-faint">
              Akun admin ini akan punya akses penuh ke panel.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Field label="Nama Sekolah" required>
              {(id) => (
                <Input
                  id={id}
                  value={schoolName}
                  onChange={(e) => {
                    setSchoolName(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="SMP Negeri 1 Contoh"
                  autoComplete="organization"
                  autoFocus
                  required
                />
              )}
            </Field>

            <Field label="Alamat Sekolah" hint="Opsional">
              {(id) => (
                <Input
                  id={id}
                  value={schoolAddress}
                  onChange={(e) => setSchoolAddress(e.target.value)}
                  placeholder="Jl. Pendidikan No. 1"
                  autoComplete="street-address"
                />
              )}
            </Field>

            <div className="my-1 border-t border-line" />

            <Field label="Nama Admin" required>
              {(id) => (
                <Input
                  id={id}
                  value={adminName}
                  onChange={(e) => {
                    setAdminName(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Administrator"
                  autoComplete="name"
                  required
                />
              )}
            </Field>

            <Field label="NIS / Username Admin" required>
              {(id) => (
                <Input
                  id={id}
                  value={adminNis}
                  onChange={(e) => {
                    setAdminNis(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="88888"
                  autoComplete="username"
                  required
                />
              )}
            </Field>

            <Field label="Password Admin" required>
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
              )}
            </Field>

            <Field label="Ulangi Password" required>
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => {
                    setPasswordConfirm(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
              )}
            </Field>

            <div className="my-1 border-t border-line" />

            <Checkbox
              checked={chatEnabled}
              onChange={setChatEnabled}
              label="Aktifkan Chat Publik"
              hint="Ruang obrolan publik siswa di dashboard (di luar ujian). Bisa diubah kapan saja di Pengaturan."
            />

            {error && (
              <p
                role="alert"
                className="rounded-[var(--radius-field)] border border-danger/20 bg-danger-wash px-3 py-2 text-sm text-danger"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              busy={submitting}
              disabled={
                !schoolName.trim() ||
                !adminName.trim() ||
                !adminNis.trim() ||
                !password ||
                !passwordConfirm
              }
              className="mt-1 w-full"
            >
              Buat Admin &amp; Mulai
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
