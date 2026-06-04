/**
 * Azhura CBT Backend - Live participant roster notifier (seam, #7)
 *
 * Exam lifecycle and socket liveness changes call {@link notifyRosterPatch} with
 * an incremental {@link RosterPatch}. This module is transport-agnostic: the
 * socket layer registers a broadcaster at startup via {@link setRosterBroadcaster}
 * (see `socket.ts`), which forwards each patch to the `supervisors` room as the
 * `roster-update` event. This mirrors the `setExamListBroadcaster` /
 * `setLogBroadcaster` pattern so route and socket code never import Socket.io.
 */

import type { RosterPatch } from "@azhura/shared";
import { createLogger } from "./logger";

const log = createLogger("RosterEvents");

/** Pushes one incremental roster change to connected supervisors. */
type RosterBroadcaster = (patch: RosterPatch) => void;

let broadcaster: RosterBroadcaster | null = null;

/**
 * Registers the transport that delivers roster patches to supervisors.
 * Called once at startup by the socket layer.
 */
export function setRosterBroadcaster(fn: RosterBroadcaster): void {
  broadcaster = fn;
}

/**
 * Emit an incremental roster change. No-op (but logged) when no broadcaster is
 * registered yet — e.g. a lifecycle event fired before the socket server booted.
 * Wrapped so a transport failure never breaks the calling request.
 */
export function notifyRosterPatch(patch: RosterPatch): void {
  if (!broadcaster) {
    log.debug("Roster patch dropped: no broadcaster registered", { type: patch.type });
    return;
  }
  try {
    broadcaster(patch);
  } catch (error) {
    log.warn("Roster broadcast failed", {
      type: patch.type,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
