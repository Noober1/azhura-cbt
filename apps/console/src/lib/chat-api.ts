/**
 * Azhura CBT Console — Public chat moderation API client (#17).
 *
 * Wrappers over the supervisor chat endpoints: post an announcement, mute/unmute
 * a student, and list active mutes. The live message feed itself arrives over the
 * socket (see components/chat/useChatStream.ts); this client is for the actions.
 */

import type { MutedUser } from "@azhura/shared";
import api from "./api";

export const chatApi = {
  /** Posts a system/announcement message into the public chat room. */
  async announce(message: string): Promise<void> {
    await api.post("/supervisor/chat/announce", { message });
  },

  /**
   * Mutes a student in chat. Omit `durationMinutes` (or pass 0) for an indefinite
   * mute that lifts only via {@link unmute}; otherwise a timed mute.
   */
  async mute(userId: string, durationMinutes?: number, reason?: string): Promise<void> {
    await api.post("/supervisor/chat/mute", {
      userId,
      ...(durationMinutes ? { durationMinutes } : {}),
      ...(reason ? { reason } : {}),
    });
  },

  /** Lifts a student's chat mute. */
  async unmute(userId: string): Promise<void> {
    await api.post("/supervisor/chat/unmute", { userId });
  },

  /** Lists currently muted students for the moderation panel. */
  async listMutes(): Promise<MutedUser[]> {
    const { data } = await api.get<{ mutes: MutedUser[] }>("/supervisor/chat/mutes");
    return data.mutes;
  },
};
