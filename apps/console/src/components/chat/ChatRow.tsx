/**
 * Azhura CBT Console — one row in the chat feed (#17).
 *
 * Renders a single message for the supervisor view: system/announcement messages
 * as a centered banner, user messages with sender/group/time plus a hover-revealed
 * mute control (timed or indefinite). The mute dropdown's open state is owned by
 * the parent so only one menu is open at a time.
 */

import type { ChatMessage } from "@azhura/shared";
import { Button } from "../ui/Button";

/** Mute duration presets offered per message; 0 = indefinite. */
const MUTE_PRESETS: { label: string; minutes: number }[] = [
  { label: "5 menit", minutes: 5 },
  { label: "30 menit", minutes: 30 },
  { label: "Permanen", minutes: 0 },
];

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

interface ChatRowProps {
  message: ChatMessage;
  muted: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onMute: (minutes: number) => void;
}

export function ChatRow({ message, muted, menuOpen, onToggleMenu, onMute }: ChatRowProps) {
  if (message.kind === "system") {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-amber-100 px-3 py-1 text-center text-xs font-semibold text-amber-800">
          📢 {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs">
          <span className="font-semibold text-ink">{message.name}</span>
          {message.groupName && <span className="ml-1 text-faint">· {message.groupName}</span>}
          <span className="ml-1.5 text-faint">{formatTime(message.timestamp)}</span>
          {muted && (
            <span className="ml-1.5 rounded bg-danger/10 px-1 text-[0.65rem] font-semibold text-danger">
              dibisukan
            </span>
          )}
        </p>
        <p className="break-words text-sm text-ink-soft">{message.content}</p>
      </div>

      {/* Mute control (revealed on hover) */}
      <div className="relative shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="opacity-0 group-hover:opacity-100"
          onClick={onToggleMenu}
        >
          Bisukan
        </Button>
        {menuOpen && (
          <div className="absolute right-0 z-10 mt-1 w-32 overflow-hidden rounded-[var(--radius-field)] border border-line bg-surface shadow-lg">
            {MUTE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onMute(p.minutes)}
                className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-canvas"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
