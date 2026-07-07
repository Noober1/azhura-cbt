/**
 * Azhura CBT App — Media exam-integrity gating (#164).
 *
 * Encapsulates the play-count limit for a single audio/video clip. Counts one
 * play each time playback STARTS (not when it reaches the end), reading/writing
 * the persisted count in the exam store (keyed by question + media src) so the
 * budget cannot be reset by navigating away or refreshing. Counting at start —
 * rather than on `ended` — is what makes the limit tamper-resistant: a student
 * can no longer replay a capped clip for free by seeking back or navigating away
 * before the clip finishes. Seek-lock is a passive flag the player honours; it
 * is surfaced here so all integrity state lives in one place.
 */

import { useCallback, useRef } from "react";
import { useExamStore } from "../stores/exam";
import { computeIntegrity, mediaPlayKey } from "../lib/media-integrity";

export { computeIntegrity, mediaPlayKey } from "../lib/media-integrity";

export interface MediaIntegrityInput {
  /** Owning question id; combined with `src` into the persistence key. */
  questionId?: string;
  /** Resolved media URL (the clip being gated). */
  src: string;
  /** Maximum allowed plays; null = unlimited. */
  maxPlays: number | null;
  /** Whether the timeline is locked (no scrubbing). */
  noSeek: boolean;
}

export interface MediaIntegrityState {
  maxPlays: number | null;
  noSeek: boolean;
  playsUsed: number;
  /** Remaining plays; null when unlimited. */
  playsRemaining: number | null;
  /** True when the play budget is exhausted (no further plays may start). */
  limitReached: boolean;
  /** Call when playback starts — counts exactly one play per run. */
  registerPlayStart: () => void;
  /** Call when a clip reaches the end — re-arms so a genuine replay counts. */
  registerEnded: () => void;
}

export function useMediaIntegrity({
  questionId,
  src,
  maxPlays,
  noSeek,
}: MediaIntegrityInput): MediaIntegrityState {
  const key = mediaPlayKey(questionId, src);
  const playsUsed = useExamStore((s) => s.mediaPlays[key] ?? 0);
  const recordMediaPlay = useExamStore((s) => s.recordMediaPlay);

  // Counts one play per run at the moment playback starts. `countedThisRun`
  // guards a pause→resume (and duplicate `play` events) from double-counting a
  // single run; `ended` clears it so a deliberate replay counts again. Counting
  // at start (not end) means seeking back or leaving before the clip finishes
  // cannot dodge the budget.
  const countedThisRun = useRef(false);

  const registerPlayStart = useCallback(() => {
    if (countedThisRun.current) return;
    countedThisRun.current = true;
    recordMediaPlay(key);
  }, [key, recordMediaPlay]);

  const registerEnded = useCallback(() => {
    countedThisRun.current = false;
  }, []);

  const { playsRemaining, limitReached } = computeIntegrity(playsUsed, maxPlays);

  return { maxPlays, noSeek, playsUsed, playsRemaining, limitReached, registerPlayStart, registerEnded };
}
