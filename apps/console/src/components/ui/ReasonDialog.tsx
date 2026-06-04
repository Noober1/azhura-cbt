/**
 * Azhura CBT Console — Reason dialog (confirm with an optional reason).
 *
 * A sibling of {@link ConfirmDialog} for proctor actions (#11/#12) that carry a
 * message to the student: a confirm dialog with an optional free-text reason.
 * The caller controls `open` and supplies an async `onConfirm(reason)`; the
 * dialog shows a busy state while it runs and closes on success, staying open on
 * failure so a toast can explain why. An empty reason is passed through as `""`
 * (the server substitutes a default).
 */

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface ReasonDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  placeholder?: string;
  onConfirm: (reason: string) => Promise<void> | void;
  onClose: () => void;
}

export function ReasonDialog({
  open,
  title,
  message,
  confirmLabel = "Lanjutkan",
  tone = "primary",
  placeholder = "Alasan (opsional) — akan ditampilkan ke siswa",
  onConfirm,
  onClose,
}: ReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset the field whenever the dialog (re)opens so a previous reason never
  // leaks into the next action.
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch {
      // Keep the dialog open on failure; the caller surfaces the reason.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button variant={tone} busy={busy} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-soft">{message}</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={busy}
        rows={3}
        placeholder={placeholder}
        className="focus-ring mt-3 w-full resize-none rounded-[var(--radius-field)] border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint disabled:opacity-55"
      />
    </Modal>
  );
}
