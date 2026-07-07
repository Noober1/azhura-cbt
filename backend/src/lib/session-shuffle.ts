/**
 * Secret, per-session permutations for matching/sorting questions.
 *
 * Both question types encode their answer key as a structural constant: the
 * correct matching answer is the identity mapping, and the correct sorting
 * answer is the items in their authored (ascending) order. Sending the items
 * in canonical order therefore lets a student score full marks by submitting
 * the identity permutation without knowing anything.
 *
 * The server breaks that by shuffling the presented items with a permutation
 * derived from an HMAC keyed by the server's JWT secret over
 * `${sessionId}:${questionId}`. It is:
 *  - deterministic  — the questions endpoint and the grader derive the same
 *    permutation for a given (session, question), so no per-session state is
 *    stored anywhere;
 *  - secret         — the client never has the HMAC key, so it cannot invert
 *    the permutation to recover the answer key;
 *  - per-session    — two students (or two attempts) get different orders.
 */

import { createHmac } from "crypto";
import { getJwtSecret } from "./env";

/**
 * Returns a permutation of `[0, n)` for the given (session, question), keyed by
 * `secret`. `perm[k]` is the original index shown at display position `k`.
 * Identity for `n < 2` (nothing to shuffle).
 */
export function sessionPermutation(
  sessionId: string,
  questionId: string,
  n: number,
  secret: string = getJwtSecret()
): number[] {
  const perm = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return perm;

  let bytes = createHmac("sha256", secret).update(`${sessionId}:${questionId}`).digest();
  let cursor = 0;
  const nextU32 = (): number => {
    if (cursor + 4 > bytes.length) {
      // Exhausted the digest — re-key off it for more entropy (rare: n > 8).
      bytes = createHmac("sha256", secret).update(bytes).digest();
      cursor = 0;
    }
    const v = bytes.readUInt32BE(cursor);
    cursor += 4;
    return v;
  };

  // Fisher–Yates driven by the keyed stream.
  for (let i = n - 1; i > 0; i--) {
    const j = nextU32() % (i + 1);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm;
}
