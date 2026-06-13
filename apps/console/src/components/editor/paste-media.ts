/**
 * Azhura CBT Console — Pure helpers for the RichTextEditor paste handler (#190).
 *
 * Extracted from the editor component so the "which pasted images must be
 * rehosted" decisions are unit-testable without a live editor or clipboard.
 * The exam client is locked down to local `/uploads/` media, so an author who
 * pastes an image from the web must have it rehosted onto our backend rather
 * than left pointing at an external origin (which #189's stem guard rejects on
 * save anyway).
 */

/** Image `File`s carried by a clipboard paste (e.g. a screenshot or copied image). */
export function imageFilesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  return Array.from(data.files).filter((file) => file.type.startsWith("image/"));
}

/** Matches an `<img>` tag's `src` (double/single-quoted or bare); group 1/2/3 holds the value. */
const IMG_SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/**
 * Distinct `<img>` `src` values in pasted HTML that `isExternal` flags as needing
 * rehosting (absolute, non-self origins). Local/self images carrying the editor's
 * `data-tiptap-media` marker are handled by the MediaEmbed parser instead, so
 * they are intentionally not returned here. Uses a tag-scoped regex (no DOM) so
 * the helper works the same in the editor and under a node test runner.
 *
 * Intentionally limited to `<img src>`: `srcset` candidates, `<source>`, and CSS
 * `url()` tokens in pasted HTML are not rehosted here — they don't survive the
 * MediaEmbed paste path and are rejected by the server-side stem guard on save.
 */
export function externalImageSrcs(html: string, isExternal: (src: string) => boolean): string[] {
  if (!html) return [];
  const found = new Set<string>();
  for (const match of html.matchAll(IMG_SRC_RE)) {
    const src = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (src.length > 0 && isExternal(src)) found.add(src);
  }
  return [...found];
}
