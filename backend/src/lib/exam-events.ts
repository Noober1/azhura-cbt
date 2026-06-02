/**
 * Azhura CBT Backend - Exam list change notifier (seam)
 *
 * Admin mutations that change which exams a student may see (create/update/
 * delete exam, toggle active, change allowed groups) call
 * {@link notifyExamListChanged}. For now this only logs; the realtime push to
 * per-group Socket.io rooms is implemented in issue #3. Keeping the call sites
 * wired up now means #3 only has to fill in the body here — no hunting for
 * every mutation later.
 */

import { createLogger } from "./logger";

const log = createLogger("ExamEvents");

/**
 * Signal that the active-exam listing changed.
 *
 * @param affectedGroupIds Groups whose students should refresh their exam list.
 *   `undefined`/empty means "potentially everyone" (e.g. an exam with no group
 *   restriction, or a change whose blast radius isn't narrowed down).
 *
 * TODO(#3): emit `exam-list-changed` to the matching per-group rooms (or
 * broadcast to all students when `affectedGroupIds` is empty).
 */
export function notifyExamListChanged(affectedGroupIds?: string[]): void {
  const scope =
    affectedGroupIds && affectedGroupIds.length > 0
      ? affectedGroupIds.join(", ")
      : "all students";
  log.info("Exam list changed", { scope });
}
