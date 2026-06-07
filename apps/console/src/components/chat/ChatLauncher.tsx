/**
 * Azhura CBT Console — Public chat launcher (#17).
 *
 * A floating action button that opens the chat moderation surface as a bottom
 * drawer, available across the console for supervisors/admins. Owns the single
 * chat stream and passes messages to {@link ChatRoomPanel}; badges the FAB with
 * unread messages that arrive while the drawer is closed. Hidden entirely while
 * chat is globally disabled.
 */

import { useEffect, useRef, useState } from "react";
import { useChatStream } from "./useChatStream";
import { ChatRoomPanel } from "./ChatRoomPanel";
import { Badge } from "../ui/Badge";
import { MessageSquareIcon, XIcon } from "../ui/icons";

export function ChatLauncher() {
  const { messages, presence, connected, enabled } = useChatStream();

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const seenCountRef = useRef(0);

  // Count messages that land while the drawer is closed.
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

  // Escape to close + lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close if chat is turned off globally.
  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  // enabled is null until the first chat:config; only show the FAB once on.
  if (enabled !== true) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Buka chat peserta"
          className="focus-ring fixed bottom-6 right-6 z-40 grid size-14 place-items-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 transition-transform hover:scale-105 active:scale-95"
        >
          <MessageSquareIcon className="size-6" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-xs font-bold text-white ring-2 ring-accent">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Chat peserta"
            className="absolute inset-x-0 bottom-0 flex h-[80dvh] flex-col rounded-t-[var(--radius-card)] border-t border-line bg-surface shadow-2xl shadow-ink/20 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:h-[36rem] sm:w-[40rem] sm:rounded-[var(--radius-card)] sm:border"
          >
            <header className="flex items-center gap-2 border-b border-line px-4 py-3">
              <MessageSquareIcon className="size-5 text-accent" />
              <h2 className="text-sm font-semibold text-ink">Chat Peserta</h2>
              <Badge tone={connected ? "positive" : "neutral"}>
                {connected ? "Live" : "Terputus"}
              </Badge>
              <span className="ml-auto text-xs text-faint">{presence.length} siswa online</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Tutup chat"
                className="focus-ring -mr-1 ml-1 rounded-md p-1 text-faint transition-colors hover:bg-canvas hover:text-ink"
              >
                <XIcon className="size-5" />
              </button>
            </header>

            <ChatRoomPanel messages={messages} />
          </div>
        </div>
      )}
    </>
  );
}
