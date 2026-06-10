/**
 * Azhura CBT App - Public chat launcher (#17)
 *
 * A floating action button (FAB) that opens the chat as a bottom drawer. Renders
 * nothing while chat is globally disabled. Tracks unread messages that arrive
 * while the drawer is closed and badges the FAB; opening clears the count and
 * closing the drawer if chat gets disabled mid-session.
 *
 * Built on Radix Dialog (focus trap + a11y) with bottom-anchored content.
 */

import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { MessagesSquare, X } from "lucide-react";
import { useChatStore } from "../../stores/chat";
import { ChatPanel } from "./ChatPanel";

export function ChatDrawer() {
  const enabled = useChatStore((s) => s.enabled);
  const messages = useChatStore((s) => s.messages);
  const presence = useChatStore((s) => s.presence);

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const seenCountRef = useRef(messages.length);

  // Count messages that arrive while the drawer is closed.
  useEffect(() => {
    if (open) {
      seenCountRef.current = messages.length;
      setUnread(0);
      return;
    }
    const delta = messages.length - seenCountRef.current;
    if (delta > 0) setUnread((u) => u + delta);
    seenCountRef.current = messages.length;
  }, [messages.length, open]);

  // Close + reset if chat is turned off globally while open.
  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      setUnread(0);
    }
  }, [enabled]);

  if (!enabled) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Buka chat peserta"
          className="focus-ring fixed bottom-6 right-6 z-40 grid size-14 place-items-center rounded-full bg-indigo text-white border-[2.5px] border-[var(--nb-ink)] shadow-[3px_3px_0_var(--nb-ink)] transition-transform hover:scale-105 active:scale-95"
        >
          <MessagesSquare className="size-6" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-xs font-bold text-white ring-2 ring-[var(--nb-ink)]">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex h-[80dvh] flex-col rounded-t-2xl bg-white text-foreground shadow-2xl outline-none data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom sm:inset-x-auto sm:right-6 sm:bottom-6 sm:h-[34rem] sm:w-[26rem] sm:rounded-2xl"
        >
          <header className="flex items-center gap-2 border-b border-soft px-4 py-3 dark:border-soft">
            <MessagesSquare className="size-5 text-indigo" />
            <DialogPrimitive.Title className="text-sm font-bold">
              Chat Peserta
            </DialogPrimitive.Title>
            <span className="ml-auto text-xs font-medium text-muted-foreground">
              {presence.length} online
            </span>
            <DialogPrimitive.Close
              aria-label="Tutup chat"
              className="focus-ring -mr-1 ml-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </header>

          <div className="flex min-h-0 flex-1 flex-col p-3">
            <ChatPanel />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
