/**
 * Azhura CBT App — Media exam-integrity gating (#164).
 *
 * Encapsulates the play-count limit for a single audio/video clip. Counts one
 * play each time a clip plays through to the end, reading/writing the persisted
 * count in the exam store (keyed by question + media src) so the budget cannot
 * be reset by navigating away or refreshing. Seek-lock is a passive flag the
 * player honours; it is surfaced here so all integrity state lives in one place.
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
  /** Call when playback starts — arms the next end to be counted. */
  registerPlayStart: () => void;
  /** Call when a clip plays through to the end — counts exactly one play. */
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

  // Counts one play per playthrough. Armed when playback starts and disarmed on
  // the first `ended`, so a media element that fires `ended` twice (or a
  // resume-after-pause) never double-counts a single run.
  const armed = useRef(false);

  const registerPlayStart = useCallback(() => {
    armed.current = true;
  }, []);

  const registerEnded = useCallback(() => {
    if (!armed.current) return;
    armed.current = false;
    recordMediaPlay(key);
  }, [key, recordMediaPlay]);

  const { playsRemaining, limitReached } = computeIntegrity(playsUsed, maxPlays);

  return { maxPlays, noSeek, playsUsed, playsRemaining, limitReached, registerPlayStart, registerEnded };
}
