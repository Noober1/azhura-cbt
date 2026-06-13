/**
 * Azhura CBT App — Media exam-integrity primitives (#164).
 *
 * Pure, dependency-free helpers shared by the integrity hook and the
 * RichContent island extractor: persistence keying, play-budget computation,
 * and parsing of the `data-max-plays` / `data-no-seek` attributes that the
 * console author sets on a clip. Kept free of React/store imports so the
 * integrity rules can be unit-tested in a plain Node environment.
 */

/** Builds the persistence key for a clip from its owning question + media src. */
export function mediaPlayKey(questionId: string | undefined, src: string): string {
  return `${questionId ?? "q"}:${src}`;
}

/**
 * Given the plays used and the cap, derive remaining plays and whether the
 * limit is reached. `maxPlays === null` means unlimited.
 */
export function computeIntegrity(
  playsUsed: number,
  maxPlays: number | null
): { playsRemaining: number | null; limitReached: boolean } {
  if (maxPlays == null) return { playsRemaining: null, limitReached: false };
  const remaining = Math.max(0, maxPlays - playsUsed);
  return { playsRemaining: remaining, limitReached: remaining <= 0 };
}

/** Parses a `data-max-plays` attribute value into a positive int, or null (unlimited). */
export function parseMaxPlaysAttr(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** A `data-no-seek` attribute that is present and not "false" means seek is locked. */
export function parseNoSeekAttr(raw: string | null): boolean {
  return raw !== null && raw !== "false";
}
