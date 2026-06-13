/**
 * Azhura CBT Backend — HTTP byte-range parsing (#164).
 *
 * Pure helper for serving media with `Range` support, which browsers require to
 * play `<video>` and to seek. Handles a single byte range only (`bytes=a-b`,
 * `bytes=a-`, or suffix `bytes=-n`) — multi-range is not needed for playback.
 */

export interface ByteRange {
  /** Inclusive start offset. */
  start: number;
  /** Inclusive end offset. */
  end: number;
}

/**
 * Resolves a `Range` request header against a resource of `size` bytes.
 *
 * @returns
 * - `null` — no range header, or one that should be ignored (serve full `200`).
 * - `"unsatisfiable"` — a syntactically valid range that falls outside the
 *   resource (caller should respond `416`).
 * - `{ start, end }` — an inclusive byte range to stream as `206`.
 */
export function parseByteRange(
  rangeHeader: string | undefined,
  size: number
): ByteRange | "unsatisfiable" | null {
  if (!rangeHeader || size <= 0) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;

  const hasStart = match[1] !== "";
  const hasEnd = match[2] !== "";
  if (!hasStart && !hasEnd) return null; // "bytes=-" is meaningless → ignore.

  let start: number;
  let end: number;

  if (!hasStart) {
    // Suffix range: the last N bytes.
    const suffix = Number(match[2]);
    if (suffix <= 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = hasEnd ? Number(match[2]) : size - 1;
  }

  end = Math.min(end, size - 1);

  if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start >= size || start > end) {
    return "unsatisfiable";
  }

  return { start, end };
}
