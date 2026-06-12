/**
 * Azhura CBT Console — Help tutorial asset resolution (#180).
 *
 * Tutorial visuals are static documentation assets that live in the repo at
 * `src/assets/help/<topic>/<step>.webp` (animated WebP, <10s) with an optional
 * reduced-motion fallback frame at `<topic>/<step>.poster.webp` (non-animated).
 * They are NOT user uploads, so they never go through `/uploads` or the media
 * library.
 *
 * `import.meta.glob` (lazy, `?url`) keeps every visual out of the initial
 * bundle: each file becomes its own async module that is only fetched when the
 * carousel actually shows that step. Missing files simply don't appear in the
 * registry, and the carousel falls back to a visible "no visual yet"
 * placeholder — the feature ships even before any recording exists.
 *
 * `pickHelpImage` is pure (the registry is injectable) so the
 * poster-vs-animated decision is unit-testable without real files.
 */

/** Lazily imports one asset and resolves to its served URL. */
export type HelpAssetLoader = () => Promise<string>;

/** Where tutorial assets live, as seen from this module. */
const ASSET_PREFIX = "../assets/help/";

const HELP_ASSETS = import.meta.glob("../assets/help/**/*.webp", {
  query: "?url",
  import: "default",
}) as Record<string, HelpAssetLoader>;

/**
 * Naming convention for the reduced-motion fallback frame:
 * `groups/1.webp` → `groups/1.poster.webp`.
 */
export function posterImageOf(image: string): string {
  return image.replace(/\.webp$/, ".poster.webp");
}

/**
 * Picks the loader for a tutorial step's visual.
 *
 * Animated WebP auto-plays and cannot be paused, so when the operator asks for
 * reduced motion we prefer the static poster frame. If no poster exists we
 * still show the animation (the step description always explains the action in
 * text); if neither file exists we return `null` and the carousel renders its
 * placeholder.
 */
export function pickHelpImage(
  image: string,
  reducedMotion: boolean,
  registry: Record<string, HelpAssetLoader> = HELP_ASSETS,
): HelpAssetLoader | null {
  if (reducedMotion) {
    const poster = registry[ASSET_PREFIX + posterImageOf(image)];
    if (poster) return poster;
  }
  return registry[ASSET_PREFIX + image] ?? null;
}
