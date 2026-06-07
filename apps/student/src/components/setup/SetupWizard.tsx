import { useState } from "react";
import { useConfigStore } from "../../stores/config";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { toast } from "sonner";
import { isTauri, exitApp } from "../../lib/kiosk";
import type { SchoolInfo } from "@azhura/shared";

type WizardStatus = "idle" | "testing" | "success" | "error";

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { setServerUrl, setSchoolInfo } = useConfigStore();
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<WizardStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [preview, setPreview] = useState<SchoolInfo | null>(null);

  const normalizeUrl = (raw: string) => raw.replace(/\/+$/, "");

  const handleTest = async () => {
    const base = normalizeUrl(url.trim());
    if (!base) {
      setErrorMsg("URL server tidak boleh kosong.");
      setStatus("error");
      return;
    }
    setStatus("testing");
    setErrorMsg("");
    setPreview(null);

    try {
      const healthRes = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!healthRes.ok)
        throw new Error(`Health check gagal (HTTP ${healthRes.status})`);

      const infoRes = await fetch(`${base}/api/info`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!infoRes.ok)
        throw new Error(
          `Gagal mengambil info sekolah (HTTP ${infoRes.status})`,
        );

      const info = (await infoRes.json()) as SchoolInfo;
      setPreview(info);
      setStatus("success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Tidak dapat terhubung ke server.";
      setErrorMsg(message);
      setStatus("error");
    }
  };

  const handleSave = async () => {
    if (!preview) return;
    const base = normalizeUrl(url.trim());
    await setServerUrl(base);
    await setSchoolInfo(preview);
    toast.success("Konfigurasi disimpan. Silakan login.");
    onComplete();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Setup Azhura CBT</CardTitle>
          <CardDescription>
            Masukkan URL server backend untuk menghubungkan aplikasi ini ke
            sistem ujian sekolah.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="server-url">URL Server Backend</Label>
            <Input
              id="server-url"
              placeholder="http://192.168.1.1:3000"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setStatus("idle");
                setPreview(null);
              }}
              disabled={status === "testing"}
            />
          </div>

          {status === "error" && (
            <p className="text-sm text-destructive">{errorMsg}</p>
          )}

          {status === "success" && preview && (
            <div className="rounded-md border border-border bg-muted p-3 space-y-1">
              <p className="text-sm font-medium text-foreground">
                {preview.schoolName}
              </p>
              {preview.address && (
                <p className="text-xs text-muted-foreground">
                  {preview.address}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Versi app: {preview.appVersion}
              </p>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-2">
          <Button
            className="w-full"
            variant="outline"
            onClick={handleTest}
            disabled={status === "testing" || !url.trim()}
          >
            {status === "testing" ? "Menguji koneksi…" : "Test Koneksi"}
          </Button>

          {status === "success" && (
            <Button className="w-full" onClick={handleSave}>
              Simpan &amp; Lanjutkan
            </Button>
          )}

          {/* Escape hatch: quit the app from the wizard (e.g. to run OS-level
              network diagnostics) when there's no other way out. Tauri-only. */}
          {isTauri() && (
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => void exitApp()}
            >
              Keluar aplikasi
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
