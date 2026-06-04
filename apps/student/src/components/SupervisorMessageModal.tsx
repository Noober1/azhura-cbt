/**
 * Azhura CBT App - Supervisor Message Modal (#13)
 *
 * Renders a supervisor broadcast sent with the `modal` variant as a lightly
 * blocking dialog the student must acknowledge. Driven by `supervisorModal` in
 * the socket store (set by the `alert-message` handler in `lib/socket.ts`).
 * Mounted globally in `App.tsx` alongside the toast container.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSocketStore } from "@/stores/socket";

export function SupervisorMessageModal() {
  const message = useSocketStore((s) => s.supervisorModal);
  const dismiss = useSocketStore((s) => s.dismissSupervisorModal);

  return (
    <Dialog open={message !== null} onOpenChange={(open) => !open && dismiss()}>
      <DialogContent showCloseButton={false} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pesan dari Pengawas</DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-base text-foreground">
            {message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={dismiss} autoFocus>
            Mengerti
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
