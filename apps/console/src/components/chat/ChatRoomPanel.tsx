/**
 * Azhura CBT Console — Public chat panel body (#17).
 *
 * The moderation surface rendered inside {@link ChatLauncher}'s bottom drawer: a
 * live message feed, an announcement composer (posts a system message), and a
 * muted-users panel. Messages are passed in (the launcher owns the single chat
 * stream); mutes are fetched and managed here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, MutedUser } from "@azhura/shared";
import { chatApi } from "../../lib/chat-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { ChatRow } from "./ChatRow";
import { Button } from "../ui/Button";
import { Field, Textarea } from "../ui/Field";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

interface ChatRoomPanelProps {
  messages: ChatMessage[];
}

export function ChatRoomPanel({ messages }: ChatRoomPanelProps) {
  const [announcement, setAnnouncement] = useState("");
  const [sending, setSending] = useState(false);
  const [mutes, setMutes] = useState<MutedUser[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);

  const refreshMutes = useCallback(() => {
    chatApi
      .listMutes()
      .then(setMutes)
      .catch((err) => toast.error(getErrorMessage(err, "Gagal memuat daftar bisu.")));
  }, []);

  useEffect(() => {
    refreshMutes();
  }, [refreshMutes]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const mutedIds = useMemo(() => new Set(mutes.map((m) => m.userId)), [mutes]);

  async function sendAnnouncement() {
    const text = announcement.trim();
    if (!text) return;
    setSending(true);
    try {
      await chatApi.announce(text);
      setAnnouncement("");
      toast.success("Pengumuman terkirim.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal mengirim pengumuman."));
    } finally {
      setSending(false);
    }
  }

  async function mute(message: ChatMessage, minutes: number) {
    if (!message.userId) return;
    setMenuFor(null);
    try {
      await chatApi.mute(message.userId, minutes || undefined, undefined);
      toast.success(`${message.name} dibisukan.`);
      refreshMutes();
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal membisukan peserta."));
    }
  }

  async function unmute(userId: string, name: string) {
    try {
      await chatApi.unmute(userId);
      toast.success(`Bisu ${name} dicabut.`);
      refreshMutes();
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal mencabut bisu."));
    }
  }

  return (
    <div className="grid min-h-0 flex-1 gap-4 p-4 md:grid-cols-[1fr_260px]">
      {/* Feed + composer */}
      <div className="flex min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <p className="m-auto text-sm text-faint">Belum ada pesan.</p>
          ) : (
            messages.map((m) => (
              <ChatRow
                key={m.id}
                message={m}
                muted={m.userId ? mutedIds.has(m.userId) : false}
                menuOpen={menuFor === m.id}
                onToggleMenu={() => setMenuFor((cur) => (cur === m.id ? null : m.id))}
                onMute={(minutes) => mute(m, minutes)}
              />
            ))
          )}
          <div ref={feedEndRef} />
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <Field label="Kirim pengumuman">
            {(id) => (
              <div className="flex items-end gap-2">
                <Textarea
                  id={id}
                  rows={2}
                  value={announcement}
                  maxLength={500}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  placeholder="Tulis pengumuman untuk semua peserta…"
                />
                <Button
                  onClick={sendAnnouncement}
                  busy={sending}
                  disabled={announcement.trim().length === 0}
                >
                  Kirim
                </Button>
              </div>
            )}
          </Field>
        </div>
      </div>

      {/* Muted-users panel */}
      <aside className="hidden min-h-0 flex-col overflow-y-auto rounded-[var(--radius-card)] border border-line bg-canvas/40 p-3 md:flex">
        <h2 className="text-sm font-semibold text-ink">Peserta dibisukan</h2>
        <p className="mt-0.5 text-xs text-faint">{mutes.length} aktif</p>
        <ul className="mt-3 space-y-2">
          {mutes.length === 0 ? (
            <li className="text-xs text-faint">Tidak ada peserta yang dibisukan.</li>
          ) : (
            mutes.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between gap-2 rounded-[var(--radius-field)] border border-line bg-surface px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{m.name}</p>
                  <p className="text-xs text-faint">
                    {m.mutedUntil === null ? "Permanen" : `s/d ${formatTime(m.mutedUntil)}`}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => unmute(m.userId, m.name)}>
                  Cabut
                </Button>
              </li>
            ))
          )}
        </ul>
      </aside>
    </div>
  );
}
