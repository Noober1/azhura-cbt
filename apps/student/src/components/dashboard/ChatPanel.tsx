/**
 * Azhura CBT App - Public chat conversation body (#17)
 *
 * The live message list plus a composer with @mention autocomplete and an emoji
 * picker. Designed to fill its container — it is mounted inside {@link ChatDrawer}
 * (a bottom sheet opened by a floating button). While muted (anti-spam or
 * supervisor), the composer locks and shows the reason, with a live countdown for
 * timed anti-spam mutes.
 *
 * Reads everything from the chat store (driven by socket events in `lib/socket.ts`)
 * and posts via `sendChat`. The server enforces dashboard-only membership, so this
 * surface never receives chat events during an exam.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useChatStore } from "../../stores/chat";
import { useAuthStore } from "../../stores/auth";
import { sendChat } from "../../lib/socket";
import { findActiveMention, applyMention } from "../../lib/mentions";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ChatMessageItem } from "./ChatMessageItem";
import { EmojiPickerButton } from "./EmojiPickerButton";

/** Live "mm:ss" remaining until `until`, recomputed every second; null when past. */
function useCountdown(until: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until]);
  if (until === null) return null;
  const remaining = until - now;
  return remaining > 0 ? remaining : null;
}

const formatRemaining = (ms: number): string => {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export function ChatPanel() {
  const { messages, presence, mutedUntil, muteReason, muteManual } = useChatStore();
  const { user, userId } = useAuthStore();

  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const selfName = user?.name ?? "";
  const mentionNames = useMemo(() => presence.map((m) => m.name), [presence]);

  // Active anti-spam countdown (manual mutes show no countdown — indefinite feel).
  const remaining = useCountdown(muteManual ? null : mutedUntil);
  const isMuted = mutedUntil !== null && (muteManual || remaining !== null);

  // Mention autocomplete state, derived from the caret position.
  const [mentionQuery, setMentionQuery] = useState<{ query: string; start: number } | null>(null);
  const suggestions = useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.query.toLowerCase();
    return presence
      .filter((m) => m.userId !== userId && m.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, presence, userId]);

  // Keep the newest message in view.
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const refreshMention = (value: string, caret: number): void => {
    setMentionQuery(findActiveMention(value, caret));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setDraft(e.target.value);
    refreshMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
  };

  const pickMention = (name: string): void => {
    if (!mentionQuery) return;
    const caret = inputRef.current?.selectionStart ?? draft.length;
    const next = applyMention(draft, mentionQuery.start, caret, name);
    setDraft(next.value);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const insertEmoji = (emoji: string): void => {
    const caret = inputRef.current?.selectionStart ?? draft.length;
    const next = draft.slice(0, caret) + emoji + draft.slice(caret);
    setDraft(next);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const pos = caret + emoji.length;
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const submit = (): void => {
    const text = draft.trim();
    if (!text || isMuted) return;
    sendChat(text);
    setDraft("");
    setMentionQuery(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (suggestions.length > 0 && e.key === "Enter") {
      e.preventDefault();
      pickMention(suggestions[0].name);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape") setMentionQuery(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Message list */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1">
        {messages.length === 0 ? (
          <p className="m-auto text-center text-sm text-muted-foreground">
            Belum ada pesan. Sapa teman sekelasmu! 👋
          </p>
        ) : (
          messages.map((m) => (
            <ChatMessageItem
              key={m.id}
              message={m}
              isOwn={m.userId !== null && m.userId === userId}
              selfName={selfName}
              mentionNames={mentionNames}
            />
          ))
        )}
        <div ref={listEndRef} />
      </div>

      {/* Mute banner */}
      {isMuted && (
        <div className="rounded-lg border border-rose-300/50 bg-rose-50/80 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          {muteReason ?? "Anda sedang dibisukan."}
          {!muteManual && remaining !== null && (
            <span className="ml-1 font-mono">({formatRemaining(remaining)})</span>
          )}
        </div>
      )}

      {/* Composer */}
      <div className="relative">
        {suggestions.length > 0 && (
          <ul className="absolute bottom-full left-0 mb-1 w-56 overflow-hidden rounded-lg border-2 border-[var(--nb-ink)] bg-white shadow-[3px_3px_0_var(--nb-ink)]">
            {suggestions.map((m) => (
              <li key={m.userId}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickMention(m.name);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-indigo/10"
                >
                  <span className="font-semibold text-indigo">
                    @{m.name}
                  </span>
                  {m.groupName && (
                    <span className="text-xs text-muted-foreground">{m.groupName}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-1.5">
          <Input
            ref={inputRef}
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={isMuted}
            maxLength={500}
            placeholder={isMuted ? "Anda sedang dibisukan…" : "Tulis pesan… (@ untuk sebut)"}
            aria-label="Tulis pesan chat"
          />
          <EmojiPickerButton onSelect={insertEmoji} disabled={isMuted} />
          <Button
            type="button"
            size="icon"
            onClick={submit}
            disabled={isMuted || draft.trim().length === 0}
            aria-label="Kirim pesan"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
