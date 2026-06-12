/**
 * Azhura CBT Console — Header "Keluar" action + confirmation (#181).
 *
 * Speaks the same bordered neobrutalist language as its header siblings (thick
 * ink border + hard shadow, via the `danger-outline` Button variant) while the
 * light destructive accent keeps it readable as "leave", not just another tool.
 *
 * Clicking opens a confirmation dialog; `onLogout` fires only after the
 * operator confirms. "Batal", Escape, and the scrim all close the dialog
 * without logging out (focus handling/Esc come from the shared <Modal/> that
 * <ConfirmDialog/> is built on).
 */

import { useState } from "react";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { LogOutIcon } from "../ui/icons";

interface LogoutButtonProps {
  /** Called only after the operator confirms the dialog. */
  onLogout: () => void;
}

export function LogoutButton({ onLogout }: LogoutButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Button
        variant="danger-outline"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        leadingIcon={<LogOutIcon className="size-4" />}
      >
        Keluar
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        title="Yakin ingin keluar?"
        message="Sesi Anda akan diakhiri dan Anda kembali ke halaman masuk."
        confirmLabel="Keluar"
        tone="danger"
        onConfirm={onLogout}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
