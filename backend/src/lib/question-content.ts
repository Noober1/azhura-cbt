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

/** Re-export so callers that own only the upload-path rule can reuse it. */
export { isLocalUploadPath };

/**
 * A decision returned by the {@link rewriteEmbeddedMedia} callback for each
 * embedded resource value it visits:
 * - `"keep"`              — leave the attribute / `url()` token unchanged.
 * - `{ replace: string }` — substitute a new value, preserving the surrounding
 *                           attribute name and original quoting (or the
 *                           `url(...)` wrapper).
 * - `"drop"`              — remove the resource: the whole `name="value"` token
 *                           is stripped for attributes; a CSS `url(...)` becomes
 *                           the `none` keyword so the declaration stays valid.
 */
export type MediaRewrite = "keep" | "drop" | { replace: string };

/** Whether a visited resource value came from an attribute or a CSS `url()`. */
export type MediaTokenKind = "attr" | "css";

/** The quote char a value was authored with (`""` for an unquoted/bare value). */
function matchedQuote(dq: string | undefined, sq: string | undefined): '"' | "'" | "" {
  if (dq !== undefined) return '"';
  if (sq !== undefined) return "'";
  return "";
}

/**
 * Walks every auto-fetched resource in `html` — the same `src`/`srcset`/`poster`
 * attributes and CSS `url(...)` tokens that {@link findExternalMediaSrc} detects —
 * and rewrites each according to `decide`. This is the transform counterpart of
 * the read-only guard: both share the exact same patterns, so a value the guard
 * would flag is precisely a value this primitive hands to `decide`.
 *
 * Returns a new string; the input is never mutated. Used by the external-media
 * scrub migration to relativize self-origin URLs and neutralize genuinely
 * external ones in legacy question stems.
 *
 * NOTE: a `srcset` value is passed to `decide` whole (e.g. `"a.png 1x, b.png 2x"`),
 * not per-candidate — so the scrub treats it as one non-local token (dropped, or
 * a failed rehost). This matches the read guard, which rejects any non-`/uploads/`
 * `srcset` outright; the TipTap editor never emits `srcset`, so legacy stems don't
 * carry one in practice.
 */
export function rewriteEmbeddedMedia(
  html: string,
  decide: (value: string, kind: MediaTokenKind) => MediaRewrite
): string {
  const afterAttrs = html.replace(
    RESOURCE_ATTR_RE,
    (full: string, _alt: string, dq?: string, sq?: string, bare?: string): string => {
      const inner = dq ?? sq ?? bare ?? "";
      const decision = decide(inner.trim(), "attr");
      if (decision === "keep") return full;
      if (decision === "drop") return "";
      const quote = matchedQuote(dq, sq);
      const rawToken = `${quote}${inner}${quote}`;
      // Everything in `full` before the value token is the `name = ` prefix
      // (including any whitespace around `=`), which we preserve verbatim.
      const prefix = full.slice(0, full.length - rawToken.length);
      return `${prefix}${quote}${decision.replace}${quote}`;
    }
  );
  return afterAttrs.replace(
    CSS_URL_RE,
    (full: string, _alt: string, dq?: string, sq?: string, bare?: string): string => {
      const inner = dq ?? sq ?? bare ?? "";
      const decision = decide(inner.trim(), "css");
      if (decision === "keep") return full;
      if (decision === "drop") return "none";
      const quote = matchedQuote(dq, sq);
      return `url(${quote}${decision.replace}${quote})`;
    }
  );
}
