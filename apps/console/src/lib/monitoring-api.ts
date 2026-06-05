/**
 * Azhura CBT Console — Live monitoring API client (#7).
 *
 * Backfills the participant roster once on page load; subsequent changes arrive
 * live over the `roster-update` socket event (see lib/socket.ts).
 */

import type {
  RosterSnapshot,
  GroupOption,
  BroadcastTarget,
  SupervisorMessageVariant,
} from "@azhura/shared";
import api from "./api";

export const monitoringApi = {
  /** Fetches the current live roster snapshot (`GET /supervisor/roster`). */
  async getRoster(): Promise<RosterSnapshot> {
    const { data } = await api.get<RosterSnapshot>("/supervisor/roster");
    return data;
  },

  /**
   * Remote-logs-out dashboard students (#7). Pass a `userId` to log out one
   * student, or omit it to log out everyone currently on the dashboard. The
   * server rejects targeting a student who is mid-exam. Returns how many were
   * logged out.
   */
  async logoutDashboard(userId?: string): Promise<number> {
    const { data } = await api.post<{ success: boolean; count: number }>(
      "/supervisor/dashboard-logout",
      userId ? { userId } : {}
    );
    return data.count;
  },

  /**
   * Kicks an exam-taker out (#11): the server finalizes their exam, frees the
   * session, and the student's client logs out. `reason` is shown to the student.
   */
  async kickStudent(userId: string, reason?: string): Promise<void> {
    await api.post("/supervisor/kick", { userId, ...(reason ? { reason } : {}) });
  },

  /**
   * Remote-finishes an exam-taker (#12): the student's client submits and is
   * routed to their result (no logout). `reason` is shown to the student.
   */
  async forceSubmit(userId: string, reason?: string): Promise<void> {
    await api.post("/supervisor/force-submit", { userId, ...(reason ? { reason } : {}) });
  },

  /** Lists groups (id + name) for the broadcast/time-change target picker. */
  async listGroups(): Promise<GroupOption[]> {
    const { data } = await api.get<GroupOption[]>("/supervisor/groups");
    return data;
  },

  /**
   * Adds or subtracts remaining exam time (#8) for a target — one student, one or
   * more groups, or everyone mid-exam. `deltaMinutes` is positive to add time,
   * negative to subtract. Returns how many active sessions were adjusted.
   */
  async changeTime(target: BroadcastTarget, deltaMinutes: number): Promise<number> {
    const { data } = await api.post<{ success: boolean; count: number }>(
      "/supervisor/time-change",
      { target, deltaMinutes }
    );
    return data.count;
  },

  /**
   * Sends a supervisor broadcast (#13) to a target — one student, one or more
   * groups, or everyone — shown to students as a toast or a modal.
   */
  async sendMessage(input: {
    message: string;
    variant: SupervisorMessageVariant;
    target: BroadcastTarget;
  }): Promise<void> {
    await api.post("/supervisor/alert", input);
  },
};
