/**
 * Azhura CBT App - @mention parsing (#17)
 *
 * Pure helpers for the public chat: split a message into plain-text and mention
 * segments for highlighted rendering, and locate the in-progress `@token` a
 * composer is typing so it can offer autocomplete. Kept free of React/DOM so the
 * matching logic is unit-testable.
 */

/** One piece of a parsed message: literal text or a recognized @mention. */
export interface MentionSegment {
  type: "text" | "mention";
  /** For a mention, the matched name WITHOUT the leading "@"; else raw text. */
  value: string;
}

const isWordChar = (ch: string): boolean => /[^\s]/.test(ch);

/** True when `ch` continues a name (letter/digit) — used for mention boundaries. */
const isNameChar = (ch: string | undefined): boolean =>
  ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/**
 * Splits `content` into text/mention segments. A mention is an `@` immediately
 * followed by one of `names` (case-insensitive); the longest matching name wins
 * so "Budi Santoso" is preferred over "Budi". Unmatched `@` stays plain text.
 *
 * @param content The message text.
 * @param names   Known display names (e.g. present members) to recognize.
 */
export function parseMentions(content: string, names: string[]): MentionSegment[] {
  const candidates = [...names].sort((a, b) => b.length - a.length);
  const segments: MentionSegment[] = [];
  let text = "";
  let i = 0;

  const flushText = (): void => {
    if (text) {
      segments.push({ type: "text", value: text });
      text = "";
    }
  };

  while (i < content.length) {
    if (content[i] === "@") {
      const rest = content.slice(i + 1);
      const lowerRest = rest.toLowerCase();
      const match = candidates.find(
        (name) =>
          name.length > 0 &&
          lowerRest.startsWith(name.toLowerCase()) &&
          // The next char must end the name — otherwise "@A" would match inside
          // "@Ahmad" (a single-letter name swallowing a longer word).
          !isNameChar(rest[name.length])
      );
      if (match) {
        flushText();
        // Preserve the casing actually typed in the message.
        segments.push({ type: "mention", value: rest.slice(0, match.length) });
        i += 1 + match.length;
        continue;
      }
    }
    text += content[i];
    i += 1;
  }

  flushText();
  return segments;
}

/** The active mention token a composer is typing, with its start offset. */
export interface ActiveMention {
  /** Text after the `@`, before the caret (may be empty right after "@"). */
  query: string;
  /** Index of the `@` in the input value. */
  start: number;
}

/**
 * Finds the mention being typed at `caret`: the run from the last `@` back to a
 * whitespace boundary, with no spaces in between. Returns null when the caret is
 * not inside a mention token.
 */
export function findActiveMention(value: string, caret: number): ActiveMention | null {
  let i = caret - 1;
  while (i >= 0 && isWordChar(value[i])) {
    if (value[i] === "@") {
      // Only a real trigger when the `@` opens a token (start of input or after
      // whitespace) — avoids firing inside an email like "budi@sekolah".
      if (i === 0 || /\s/.test(value[i - 1])) {
        return { query: value.slice(i + 1, caret), start: i };
      }
      return null;
    }
    i -= 1;
  }
  return null;
}

/**
 * Replaces the active mention token at `start` with `@name ` and returns the new
 * input value plus the caret offset to place after the inserted mention.
 */
export function applyMention(
  value: string,
  start: number,
  caret: number,
  name: string
): { value: string; caret: number } {
  const inserted = `@${name} `;
  const next = value.slice(0, start) + inserted + value.slice(caret);
  return { value: next, caret: start + inserted.length };
}
