/**
 * Question stems are rich HTML authored in the console (TipTap MediaEmbed).
 * Embedded media that the browser auto-fetches — <img>/<video>/<audio>/<source>
 * `src` and <video> `poster` — must reference local `/uploads/` assets only,
 * mirroring the per-option `imageUrl` guard (`^/uploads/`).
 *
 * Without this, a question author could embed `<img src="https://evil/track.gif">`
 * in the stem; exam clients would fetch that external URL mid-exam (tracking
 * beacon, IP leak), defeating the locked-down exam model. Client-side DOMPurify
 * strips dangerous protocols (javascript:, onerror) but still permits external
 * https images, so this server-side gate is the actual enforcement point.
 *
 * The check is fail-closed: any auto-fetched resource — whether an attribute
 * (`src`/`srcset`/`poster`) or a CSS `url(...)` token inside an inline `style`
 * (e.g. `background-image`) — whose value is not a local `/uploads/...` path is
 * rejected. `srcset` is included so a responsive-image candidate list cannot
 * smuggle an external host past the single-`src` check, and `url()` is included
 * so an inline-style background image cannot smuggle one past the attribute
 * scan (DOMPurify preserves `style` attributes, so this is the enforcement
 * point for that vector).
 *
 * Note on the console contract: the console now always persists stem media as
 * relative `/uploads/...` paths, so an absolute URL reaching this guard is, by
 * design, an external resource and is rejected.
 */

// Matches `src=` / `srcset=` / `poster=` on any tag, with double-quoted,
// single-quoted, or bare values. Group 2/3/4 holds the value depending on the
// quoting style.
const RESOURCE_ATTR_RE =
  /\b(?:src|srcset|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;

// Matches a CSS `url(...)` token (e.g. in `style="background-image:url(...)"`),
// with optional whitespace and optional single/double quotes. Group 2/3/4 holds
// the value depending on the quoting style.
const CSS_URL_RE =
  /url\(\s*("([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;

/** A served upload path; protocol-relative `//host` and any scheme are rejected. */
function isLocalUploadPath(value: string): boolean {
  return value.startsWith("/uploads/");
}

/**
 * Returns the first embedded resource in `html` that is not a local
 * `/uploads/` path, or `null` when every auto-fetched resource is local.
 */
export function findExternalMediaSrc(html: string): string | null {
  for (const match of html.matchAll(RESOURCE_ATTR_RE)) {
    const value = (match[2] ?? match[3] ?? match[4] ?? "").trim();
    if (!isLocalUploadPath(value)) return value;
  }
  for (const match of html.matchAll(CSS_URL_RE)) {
    const value = (match[2] ?? match[3] ?? match[4] ?? "").trim();
    if (!isLocalUploadPath(value)) return value;
  }
  return null;
}
