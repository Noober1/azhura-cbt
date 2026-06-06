import { useState } from "react";
import { useConfigStore } from "../../stores/config";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Separator } from "../ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { toast } from "sonner";
import type { SchoolInfo } from "@azhura/shared";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

type ConnectionStatus = "idle" | "testing" | "success" | "error";

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const {
    serverUrl,
    schoolInfo,
    antiCheat,
    debugMode,
    setServerUrl,
    setSchoolInfo,
    setAntiCheat,
    setDebugMode,
    changePassphrase,
    verifyPassphrase,
  } = useConfigStore();

  const [urlInput, setUrlInput] = useState(serverUrl);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("idle");
  const [connError, setConnError] = useState("");

  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passError, setPassError] = useState("");

  const normalizeUrl = (raw: string) => raw.replace(/\/+$/, "");

  const handleTestAndSaveUrl = async () => {
    const base = normalizeUrl(urlInput.trim());
    if (!base) return;
    setConnStatus("testing");
    setConnError("");
    try {
      const healthRes = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
      if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
      const infoRes = await fetch(`${base}/api/info`, { signal: AbortSignal.timeout(5000) });
      const info = infoRes.ok ? (await infoRes.json() as SchoolInfo) : null;
      await setServerUrl(base);
      if (info) await setSchoolInfo(info);
      setConnStatus("success");
      toast.success("Server URL disimpan.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tidak dapat terhubung.";
      setConnError(msg);
      setConnStatus("error");
    }
  };

  const handleChangePassphrase = async () => {
    setPassError("");
    if (!oldPass || !newPass || !confirmPass) {
      setPassError("Semua kolom wajib diisi.");
      return;
    }
    if (newPass !== confirmPass) {
      setPassError("Passphrase baru tidak cocok.");
      return;
    }
    const ok = await verifyPassphrase(oldPass);
    if (!ok) {
      setPassError("Passphrase lama salah.");
      return;
    }
    await changePassphrase(newPass);
    setOldPass("");
    setNewPass("");
    setConfirmPass("");
    toast.success("Passphrase berhasil diubah.");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pengaturan Aplikasi</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Koneksi */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Koneksi</h3>
            <div className="space-y-2">
              <Label htmlFor="settings-url">URL Server Backend</Label>
              <div className="flex gap-2">
                <Input
                  id="settings-url"
                  value={urlInput}
                  onChange={(e) => { setUrlInput(e.target.value); setConnStatus("idle"); }}
                  placeholder="http://192.168.1.1:3000"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestAndSaveUrl}
                  disabled={connStatus === "testing" || !urlInput.trim()}
                >
                  {connStatus === "testing" ? "Menguji…" : "Simpan"}
                </Button>
              </div>
              {connStatus === "error" && (
                <p className="text-xs text-destructive">{connError}</p>
              )}
              {connStatus === "success" && (
                <p className="text-xs text-green-600">Terhubung &amp; disimpan.</p>
              )}
            </div>
          </section>

          <Separator />

          {/* Anti-Cheat */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Anti-Cheat</h3>
            <div className="space-y-3">
              {(
                [
                  { key: "enabled", label: "Aktifkan anti-cheat" },
                  { key: "fullscreen", label: "Paksa layar penuh" },
                  { key: "blockShortcuts", label: "Blokir shortcut keyboard" },
                  { key: "detectFocusLoss", label: "Deteksi Alt+Tab / kehilangan fokus" },
                  { key: "detectMultiMonitor", label: "Deteksi multi-monitor" },
                ] as const
              ).map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <Label htmlFor={`ac-${key}`} className="text-sm">{label}</Label>
                  <Switch
                    id={`ac-${key}`}
                    checked={antiCheat[key]}
                    onCheckedChange={(v) => setAntiCheat({ [key]: v })}
                  />
                </div>
              ))}
            </div>
          </section>

          <Separator />

          {/* Keamanan */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Keamanan</h3>
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <Label htmlFor="old-pass">Passphrase lama</Label>
                  <Input
                    id="old-pass"
                    type="password"
                    value={oldPass}
                    onChange={(e) => setOldPass(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div>
                  <Label htmlFor="new-pass">Passphrase baru</Label>
                  <Input
                    id="new-pass"
                    type="password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <Label htmlFor="confirm-pass">Konfirmasi passphrase baru</Label>
                  <Input
                    id="confirm-pass"
                    type="password"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              {passError && <p className="text-xs text-destructive">{passError}</p>}
              <Button
                variant="outline"
                size="sm"
                onClick={handleChangePassphrase}
                disabled={!oldPass || !newPass || !confirmPass}
              >
                Ganti Passphrase
              </Button>
            </div>
          </section>

          <Separator />

          {/* Developer */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Developer</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="debug-mode" className="text-sm">Debug mode</Label>
              <Switch
                id="debug-mode"
                checked={debugMode}
                onCheckedChange={setDebugMode}
              />
            </div>
            {debugMode && (
              <div className="rounded-md bg-muted p-3 text-xs space-y-1 font-mono">
                <p><span className="text-muted-foreground">Server URL:</span> {serverUrl || "—"}</p>
                <p><span className="text-muted-foreground">App version:</span> {schoolInfo?.appVersion ?? "—"}</p>
                <p><span className="text-muted-foreground">Anti-cheat:</span> {antiCheat.enabled ? "ON" : "OFF"}</p>
              </div>
            )}
          </section>

          <Separator />

          {/* Informasi */}
          {schoolInfo && (
            <section className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Informasi</h3>
              <p className="text-sm">{schoolInfo.schoolName}</p>
              {schoolInfo.address && (
                <p className="text-xs text-muted-foreground">{schoolInfo.address}</p>
              )}
              <p className="text-xs text-muted-foreground">Versi: {schoolInfo.appVersion}</p>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
