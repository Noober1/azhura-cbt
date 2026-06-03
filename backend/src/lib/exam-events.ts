/**
 * Azhura CBT Backend - Exam list change notifier (seam, #3)
 *
 * Admin mutations that change which exams a student may see (create/update/
 * delete exam, toggle active, change allowed groups, add/remove questions) call
 * {@link notifyExamListChanged}. This module is transport-agnostic: the socket
 * layer registers a broadcaster at startup via {@link setExamListBroadcaster}
 * (see `socket.ts`), so route code never imports Socket.io directly. This mirrors
 * the `setLogBroadcaster` pattern and keeps the call sites stable as endpoints
 * grow.
 */

import { createLogger } from "./logger";

const log = createLogger("ExamEvents");

/** Pushes an "exam list changed" signal to the given groups' students. */
type ExamListBroadcaster = (affectedGroupIds: string[]) => void;

let broadcaster: ExamListBroadcaster | null = null;

/**
 * Registers the transport that delivers exam-list-changed signals to clients.
 * Called once at startup by the socket layer.
 */
export function setExamListBroadcaster(fn: ExamListBroadcaster): void {
  broadcaster = fn;
}

/**
 * Signal that the active-exam listing changed.
 *
 * @param affectedGroupIds Groups whose students should refresh their exam list.
 *   Empty/undefined means no group is affected — and since the student-facing
 *   `GET /api/exams` is scoped by `exam_groups`, an exam with no allowed groups
 *   is invisible to every student, so there is simply nothing to push.
 */
export function notifyExamListChanged(affectedGroupIds?: string[]): void {
  const groups = (affectedGroupIds ?? []).filter(Boolean);
  if (groups.length === 0) {
    log.info("Exam list changed", { scope: "none (no allowed groups)" });
    return;
  }
  log.info("Exam list changed", { scope: groups.join(", ") });
  broadcaster?.(groups);
}
