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
  const { messages, presence, connected, enabled, historyLoaded } = useChatStream();

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const seenCountRef = useRef(0);

  // Establish the history baseline so backfill messages never count as unread.
  useEffect(() => {
    if (historyLoaded) {
      seenCountRef.current = messages.length;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoaded]);

  // Count live messages that land while the drawer is closed.
  useEffect(() => {
    if (!historyLoaded) return;
    if (open) {
      seenCountRef.current = messages.length;
      setUnread(0);
      return;
    }
    const delta = messages.length - seenCountRef.current;
    if (delta > 0) setUnread((u) => u + delta);
    seenCountRef.current = messages.length;
  }, [messages.length, open, historyLoaded]);

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
          className="focus-ring fixed bottom-6 right-6 z-40 grid size-14 place-items-center rounded-full border-[2.5px] border-[var(--nb-ink)] bg-accent text-white shadow-[3px_3px_0_var(--nb-ink)] transition-[transform,box-shadow] duration-[80ms] hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_var(--nb-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <MessageSquareIcon className="size-6" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full border-2 border-[var(--nb-ink)] bg-danger px-1 text-xs font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-[rgba(21,19,15,0.55)]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Chat peserta"
            className="absolute inset-x-0 bottom-0 flex h-[80dvh] flex-col overflow-hidden rounded-t-[var(--radius-card)] border-t-[3px] border-[var(--nb-ink)] bg-surface sm:inset-x-auto sm:right-6 sm:bottom-6 sm:h-[36rem] sm:w-[40rem] sm:rounded-[var(--radius-card)] sm:border-[3px] sm:shadow-[8px_8px_0_var(--nb-ink)]"
          >
            {/* Yellow drawer header band. */}
            <header className="flex items-center gap-2 border-b-[2.5px] border-[var(--nb-ink)] bg-highlight px-4 py-3">
              <MessageSquareIcon className="size-5 text-ink" />
              <h2 className="text-sm font-extrabold text-ink">Chat Peserta</h2>
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
