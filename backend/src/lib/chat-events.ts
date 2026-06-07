/**
 * Azhura CBT Backend - Chat realtime seam (#17)
 *
 * Transport-agnostic bridge between chat producers (the supervisor routes that
 * post announcements, the settings route that toggles the feature) and the
 * Socket.io layer. The socket server registers the concrete transports at
 * startup; producers call the notifier functions and never import Socket.io.
 * Mirrors `roster-events.ts` / `exam-events.ts`.
 */

import type { ChatMessage } from "@azhura/shared";
import { createLogger } from "./logger";

const log = createLogger("ChatEvents");

/** Delivers one chat message to everyone in the room. */
type ChatBroadcaster = (message: ChatMessage) => void;
/** Reacts to a global enable/disable toggle (join/leave the room + notify clients). */
type ChatConfigApplier = (enabled: boolean) => void | Promise<void>;

let broadcaster: ChatBroadcaster | null = null;
let configApplier: ChatConfigApplier | null = null;

/** Registers the transport that delivers chat messages. Called once at startup. */
export function setChatBroadcaster(fn: ChatBroadcaster): void {
  broadcaster = fn;
}

/** Registers the handler that applies a global enable/disable change live. */
export function setChatConfigApplier(fn: ChatConfigApplier): void {
  configApplier = fn;
}

/**
 * Broadcasts a chat message to the room. No-op (but logged) when no broadcaster
 * is registered yet. Wrapped so a transport failure never breaks the caller.
 */
export function broadcastChatMessage(message: ChatMessage): void {
  if (!broadcaster) {
    log.debug("Chat message dropped: no broadcaster registered", { id: message.id });
    return;
  }
  try {
    broadcaster(message);
  } catch (error) {
    log.warn("Chat broadcast failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Signals that the global `chatEnabled` setting changed, so the socket layer can
 * join/leave room members and push `chat:config` to clients. No-op (but logged)
 * before the applier is registered; failures are swallowed so the settings write
 * (which already succeeded) is never rolled back by a transport hiccup.
 */
export function notifyChatEnabledChanged(enabled: boolean): void {
  if (!configApplier) {
    log.debug("Chat config change dropped: no applier registered", { enabled });
    return;
  }
  try {
    void configApplier(enabled);
  } catch (error) {
    log.warn("Chat config apply failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
