/**
 * Azhura CBT Backend - Chat content sanitization (#17)
 *
 * Pure, I/O-free validation for an inbound chat message — the system boundary
 * where untrusted student input enters. React escapes on render, but this is the
 * server-side guard the issue requires: it trims, rejects empties, strips control
 * characters and angle brackets (so no markup can ever be stored or echoed), and
 * caps the length. Unicode — including multi-byte emoji — passes through intact.
 *
 * Side-effect free so it is unit-testable without a socket, mirroring the split
 * of `heartbeat.ts` / `broadcast.ts`.
 */

/** Outcome of {@link sanitizeChatContent}: the cleaned text, or a reject reason. */
export type SanitizeResult =
  | { ok: true; content: string }
  | { ok: false; reason: string };

// Matches C0/C1 control characters (incl. CR/LF/TAB) so a message stays a single
// clean line. Emoji and other printable Unicode fall outside this range.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F-\x9F]/g;

/**
 * Cleans and validates raw chat input.
 *
 * @param raw       The untrusted message text from the client.
 * @param maxLength Maximum allowed length (characters) after cleaning.
 * @returns `{ ok: true, content }` with the cleaned text, or `{ ok: false, reason }`.
 */
export function sanitizeChatContent(raw: unknown, maxLength: number): SanitizeResult {
  if (typeof raw !== "string") {
    return { ok: false, reason: "Pesan tidak valid." };
  }

  // Replace control chars (newlines/tabs included) with a space, strip the angle
  // brackets that could form markup, then collapse whitespace runs and trim.
  const cleaned = raw
    .replace(CONTROL_CHARS, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length === 0) {
    return { ok: false, reason: "Pesan tidak boleh kosong." };
  }
  if (cleaned.length > maxLength) {
    return { ok: false, reason: `Pesan maksimal ${maxLength} karakter.` };
  }

  return { ok: true, content: cleaned };
}
