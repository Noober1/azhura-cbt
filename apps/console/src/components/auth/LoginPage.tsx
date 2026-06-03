/**
 * Azhura CBT Console — Login.
 *
 * Admin-gated sign-in. Split layout: a branded panel (editorial, dark rail tone)
 * beside the form. On success the auth store enforces the admin-only gate and the
 * router redirects to the exams workspace.
 */

import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores/auth";
import { Button } from "../ui/Button";
import { Field, Input } from "../ui/Field";
import { ShieldIcon } from "../ui/icons";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading, error, isAuthenticated, clearError } = useAuthStore();

  const [nis, setNis] = useState("");
  const [password, setPassword] = useState("");

  const from = (location.state as { from?: string } | null)?.from ?? "/exams";

  useEffect(() => {
    if (isAuthenticated) navigate(from, { replace: true });
  }, [isAuthenticated, from, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await login(nis.trim(), password);
    if (ok) navigate(from, { replace: true });
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
            Panel Admin
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-rail-soft">
            Kelola paket ujian, soal, dan kunci jawaban dalam satu tempat. Akses
            khusus admin — terpisah dari klien ujian siswa demi keamanan.
          </p>
        </div>

        <p className="relative text-xs text-rail-soft">
          Computer-Based Test · Sekolah
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Masuk ke Console
            </h2>
            <p className="mt-1 text-sm text-faint">
              Gunakan kredensial admin Anda.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Field label="NIS / Username" required>
              {(id) => (
                <Input
                  id={id}
                  value={nis}
                  onChange={(e) => {
                    setNis(e.target.value);
                    if (error) clearError();
                  }}
                  placeholder="88888"
                  autoComplete="username"
                  autoFocus
                  required
                />
              )}
            </Field>

            <Field label="Password" required>
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) clearError();
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              )}
            </Field>

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
              busy={isLoading}
              disabled={!nis.trim() || !password}
              className="mt-1 w-full"
            >
              Masuk
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
