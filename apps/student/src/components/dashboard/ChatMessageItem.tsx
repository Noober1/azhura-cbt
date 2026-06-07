/**
 * Azhura CBT App - One chat message (#17)
 *
 * Renders a single message. System/announcement messages get a distinct banner
 * style; user messages show sender + group and align right when they are the
 * signed-in student's own. @mentions are highlighted, with the student's own
 * name emphasized more strongly. All content renders as text (React escapes) —
 * never as HTML.
 */

import { useMemo } from "react";
import type { ChatMessage } from "@azhura/shared";
import { parseMentions } from "../../lib/mentions";

interface ChatMessageItemProps {
  message: ChatMessage;
  /** True when this message was sent by the signed-in student. */
  isOwn: boolean;
  /** The signed-in student's display name (for self-mention emphasis). */
  selfName: string;
  /** Known member names used to recognize @mentions. */
  mentionNames: string[];
}

export function ChatMessageItem({ message, isOwn, selfName, mentionNames }: ChatMessageItemProps) {
  const segments = useMemo(
    () => parseMentions(message.content, mentionNames),
    [message.content, mentionNames]
  );

  if (message.kind === "system") {
    return (
      <div className="my-1.5 flex justify-center">
        <div className="max-w-[90%] rounded-full border border-amber-300/40 bg-amber-100/80 px-3 py-1 text-center text-xs font-semibold text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-300">
          📢 {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          isOwn
            ? "rounded-br-sm bg-indigo-600 text-white"
            : "rounded-bl-sm bg-white/90 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
        }`}
      >
        {!isOwn && (
          <p className="mb-0.5 text-[0.7rem] font-bold text-indigo-600 dark:text-indigo-400">
            {message.name}
            {message.groupName && (
              <span className="ml-1 font-medium text-neutral-400">· {message.groupName}</span>
            )}
          </p>
        )}
        <p className="break-words leading-snug">
          {segments.map((seg, idx) =>
            seg.type === "mention" ? (
              <span
                key={idx}
                className={
                  seg.value.toLowerCase() === selfName.toLowerCase()
                    ? "rounded bg-amber-300/80 px-1 font-bold text-amber-950"
                    : isOwn
                      ? "font-semibold text-indigo-100 underline decoration-indigo-300/60"
                      : "font-semibold text-indigo-600 dark:text-indigo-400"
                }
              >
                @{seg.value}
              </span>
            ) : (
              <span key={idx}>{seg.value}</span>
            )
          )}
        </p>
      </div>
    </div>
  );
}
