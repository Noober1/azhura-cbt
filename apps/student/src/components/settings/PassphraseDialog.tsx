import { useState, useEffect, useRef } from "react";
import { useConfigStore } from "../../stores/config";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

interface PassphraseDialogProps {
  open: boolean;
  onVerified: () => void;
  onClose: () => void;
}

export function PassphraseDialog({ open, onVerified, onClose }: PassphraseDialogProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const { verifyPassphrase } = useConfigStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await verifyPassphrase(value);
    setBusy(false);
    if (ok) {
      onVerified();
    } else {
      // Silent fail — clear input only, no error message shown
      setValue("");
      inputRef.current?.focus();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Akses Pengaturan</DialogTitle>
          <DialogDescription>Masukkan passphrase untuk membuka pengaturan.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="py-2">
            <Label htmlFor="passphrase" className="sr-only">Passphrase</Label>
            <Input
              id="passphrase"
              ref={inputRef}
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Batal
            </Button>
            <Button type="submit" disabled={busy || !value}>
              {busy ? "Memverifikasi…" : "Masuk"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
