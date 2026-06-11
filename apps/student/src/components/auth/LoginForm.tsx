import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuthStore } from "../../stores/auth";
import { useConfigStore } from "../../stores/config";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../ui/card";
import { toast } from "sonner";
import { createLogger } from "../../lib/logger";
import { getErrorMessage } from "../../lib/errors";

const log = createLogger("LoginForm");

// Login validation schema using Zod
const loginSchema = z.object({
  nis: z.string().min(5, { message: "NIS harus terdiri dari minimal 5 digit angka" }),
  password: z.string().min(6, { message: "Password minimal terdiri dari 6 karakter" }),
});

type LoginSchemaType = z.infer<typeof loginSchema>;

interface LoginFormProps {
  /** Called once authentication succeeds (used to navigate to the dashboard). */
  onSuccess: () => void;
}

/**
 * Student login card. Validates NIS + password with Zod, delegates auth to the
 * auth store, and surfaces both validation and server/connection errors inline.
 */
export const LoginForm = ({ onSuccess }: LoginFormProps) => {
  const { login, isLoading, error: authError } = useAuthStore();
  // Show the configured school name (from first-run setup) when available (#148).
  const schoolName = useConfigStore((s) => s.schoolInfo?.schoolName);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginSchemaType>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      nis: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginSchemaType) => {
    setFormError(null);
    try {
      const success = await login(data.nis, data.password);
      if (success) {
        toast.success("Login Berhasil! Selamat datang di aplikasi ujian.");
        onSuccess();
      } else {
        setFormError(useAuthStore.getState().error || "NIS atau Password salah.");
      }
    } catch (error) {
      // login() handles expected auth failures internally; reaching here means
      // an unexpected error (e.g. a thrown non-axios fault) worth tracing.
      log.error("Unexpected login error", error, { nis: data.nis });
      const message = getErrorMessage(error, "Koneksi gagal. Silakan coba lagi.");
      setFormError(message);
      toast.error(message);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-[8px_8px_0_var(--nb-ink)]">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-3">
          <div className="bg-indigo text-white p-3 rounded-2xl border-[2.5px] border-[var(--nb-ink)] shadow-[3px_3px_0_var(--nb-ink)]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-8 h-8 text-primary"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.902 59.902 0 0 1 10.399 5.84a50.648 50.648 0 0 0-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M12 13.49v.01"
              />
            </svg>
          </div>
        </div>
        <CardTitle className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
          {schoolName ?? "Azhura CBT Exam"}
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Masukkan NIS dan password untuk memulai sesi ujian
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4 pb-6">
          {/* Form Error Message */}
          {(formError || authError) && (
            <div className="p-3 text-sm rounded-lg bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5 shrink-0"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                />
              </svg>
              <span>{formError || authError}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="nis">Nomor Induk Siswa (NIS)</Label>
            <Input
              id="nis"
              placeholder="Contoh: 12345"
              autoComplete="username"
              className={errors.nis ? "border-destructive focus-visible:ring-destructive" : ""}
              disabled={isLoading}
              {...register("nis")}
            />
            {errors.nis && (
              <p className="text-xs font-medium text-destructive">{errors.nis.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password Ujian</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              className={errors.password ? "border-destructive focus-visible:ring-destructive" : ""}
              disabled={isLoading}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs font-medium text-destructive">{errors.password.message}</p>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full font-semibold" disabled={isLoading}>
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5 text-current"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>Memverifikasi...</span>
              </div>
            ) : (
              <span>Mulai Ujian</span>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};
