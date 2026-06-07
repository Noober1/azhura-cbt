/**
 * Azhura CBT Console — live chat stream hook (#17).
 *
 * The console socket joins the chat room server-side by role, so on connect it
 * receives `chat:history` (backfill), then `chat:message` (live), and
 * `chat:presence` (who's in the room). This hook accumulates a bounded buffer
 * and exposes presence + connection status. Mirrors `useRoster` / `useLogStream`.
 */

import { useEffect, useState } from "react";
import type {
  ChatConfigEvent,
  ChatHistoryEvent,
  ChatMessage,
  ChatPresenceEvent,
  ChatPresenceMember,
} from "@azhura/shared";
import { useAuthStore } from "../../stores/auth";
import { connectConsoleSocket, disconnectConsoleSocket } from "../../lib/socket";

/** Max messages retained in memory before the oldest drop off. */
const MAX_MESSAGES = 300;

export interface UseChatStreamResult {
  messages: ChatMessage[];
  presence: ChatPresenceMember[];
  connected: boolean;
  /** Whether chat is globally enabled; null until the first `chat:config` arrives. */
  enabled: boolean | null;
}

export function useChatStream(): UseChatStreamResult {
  const token = useAuthStore((s) => s.token);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [presence, setPresence] = useState<ChatPresenceMember[]>([]);
  const [connected, setConnected] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) return;
    const socket = connectConsoleSocket(token);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConfig = (data: ChatConfigEvent) => setEnabled(data.enabled);
    const onHistory = (data: ChatHistoryEvent) =>
      setMessages(data.messages.slice(-MAX_MESSAGES));
    const onMessage = (message: ChatMessage) =>
      setMessages((prev) => [...prev, message].slice(-MAX_MESSAGES));
    const onPresence = (data: ChatPresenceEvent) => setPresence(data.members);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("chat:config", onConfig);
    socket.on("chat:history", onHistory);
    socket.on("chat:message", onMessage);
    socket.on("chat:presence", onPresence);
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("chat:config", onConfig);
      socket.off("chat:history", onHistory);
      socket.off("chat:message", onMessage);
      socket.off("chat:presence", onPresence);
      disconnectConsoleSocket();
    };
  }, [token]);

  return { messages, presence, connected, enabled };
}
