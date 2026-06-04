/**
 * Azhura CBT Backend - Broadcast targeting (#13)
 *
 * Pure mapping from a {@link BroadcastTarget} to its Socket.io destinations, kept
 * I/O-free so it can be unit-tested without a live socket (mirrors the split of
 * `roster-liveness.ts`). The socket layer ({@link supervisorActions.broadcastMessage})
 * consumes the result to emit `alert-message`.
 */

import type { BroadcastTarget } from "@azhura/shared";

/** Resolved emit destinations: either every student, or a set of rooms. */
export interface BroadcastDestination {
  /** When true, emit to all students (every non-supervisor socket). */
  toAllStudents: boolean;
  /** Specific rooms to emit to (`user:{id}` / `group:{id}`). */
  rooms: string[];
}

/** Maps a broadcast target to the rooms (or all-students) it should reach. */
export function resolveBroadcast(target: BroadcastTarget): BroadcastDestination {
  switch (target.type) {
    case "all":
      return { toAllStudents: true, rooms: [] };
    case "user":
      return { toAllStudents: false, rooms: [`user:${target.userId}`] };
    case "group":
      return { toAllStudents: false, rooms: target.groupIds.map((id) => `group:${id}`) };
  }
}
