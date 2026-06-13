import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { reportBug } from "../../lib/error-reporter";
import { getErrorMessage } from "../../lib/errors";

interface ReportBugDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Minimum description length so empty/accidental reports are not submitted. */
const MIN_DESCRIPTION = 5;

/**
 * "Lapor bug" dialog (#170). Collects a short description plus an optional
 * "attach last error" toggle, ships it via {@link reportBug}, and toasts the
 * outcome. Exported cleanly (controlled `open`/`onClose`) so the console can
 * reuse the same pattern later — it only needs to work in the student app now.
 */
export function ReportBugDialog({ open, onClose }: ReportBugDialogProps) {
  const [description, setDescription] = useState("");
  const [includeLastError, setIncludeLastError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = (): void => {
    setDescription("");
    setIncludeLastError(false);
    setSubmitting(false);
  };

  const handleClose = (): void => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (description.trim().length < MIN_DESCRIPTION) return;

    setSubmitting(true);
    try {
      const accepted = await reportBug(description, { includeLastError });
      if (accepted) {
        toast.success("Terima kasih! Laporan Anda sudah terkirim.");
        reset();
        onClose();
      } else {
        toast.error("Laporan tidak dapat diproses. Silakan coba lagi.");
        setSubmitting(false);
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Gagal mengirim laporan."));
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lapor Bug</DialogTitle>
          <DialogDescription>
            Jelaskan masalah yang Anda temui. Laporan akan dikirim ke pengawas
            untuk ditindaklanjuti.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="py-2">
            <Label htmlFor="bug-description" className="mb-2 block font-bold">
              Deskripsi masalah
            </Label>
            <Textarea
              id="bug-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contoh: Tombol kirim tidak berfungsi saat saya menekannya."
              rows={4}
              disabled={submitting}
              autoFocus
            />
          </div>
          <label className="flex items-center gap-2.5 py-1 text-sm font-medium select-none">
            <input
              type="checkbox"
              checked={includeLastError}
              onChange={(e) => setIncludeLastError(e.target.checked)}
              disabled={submitting}
              className="h-4 w-4 rounded border-[2px] border-[var(--nb-ink)] accent-primary"
            />
            Lampirkan detail error terakhir
          </label>
          <DialogFooter className="pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={submitting || description.trim().length < MIN_DESCRIPTION}
            >
              {submitting ? "Mengirim…" : "Kirim Laporan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
