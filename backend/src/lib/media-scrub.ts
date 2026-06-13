/**
 * Azhura CBT Backend — External-media scrub policy (#190).
 *
 * Decides what to do with each media reference found in a legacy question stem
 * (`questions.text`) or option image (`options.image_url`):
 * - **local** (`/uploads/...`)        → keep as-is.
 * - **self-origin** (an absolute URL pointing at our own backend `/uploads/`)
 *                                       → relativize to `/uploads/...` (portable,
 *                                         and passes the `^/uploads/` stem guard).
 * - **external** (any other absolute)  → rehost (download + audit + store) and
 *                                         rewrite to the local copy; if rehosting
 *                                         fails, either drop the reference
 *                                         (`stripFailed`) or leave it for the
 *                                         report (dry-run / `--keep-failed`).
 *
 * Pure except for the injected `rehost` step: classification/relativization are
 * synchronous, and the actual fetch+store is a dependency so unit tests need no
 * network or DB. The HTML transform reuses {@link rewriteEmbeddedMedia}, whose
 * patterns are shared with the server-side stem guard — so detection and
 * scrubbing can never drift.
 */

import {
  rewriteEmbeddedMedia,
  isLocalUploadPath,
  type MediaRewrite,
} from "./question-content";
import type { SavedFile } from "./upload";
import type { RehostResult, RehostFailureReason } from "./rehost-media";

/** How a media value relates to our own origin. */
export type MediaClassification = "local" | "self-origin" | "external";

/** The injected rehost step (defaults to `rehostExternalUrl` in production). */
export type RehostFn = (url: string) => Promise<RehostResult>;

export interface ScrubContext {
  /** Origins counted as "ours", normalized (no trailing slash) via {@link normalizeOrigins}. */
  selfOrigins: string[];
  /** Download + audit + store an external URL. */
  rehost: RehostFn;
  /** When an external URL can't be rehosted: `true` drops the reference, `false` leaves it. */
  stripFailed: boolean;
}

/** The outcome decided for a single media reference. */
export type MediaAction =
  | { kind: "keep"; value: string }
  | { kind: "relativized"; from: string; value: string }
  | { kind: "rehosted"; from: string; value: string; saved: SavedFile }
  | { kind: "dropped"; from: string; reason: RehostFailureReason }
  | { kind: "failed"; from: string; reason: RehostFailureReason };

/** Trims and strips trailing slashes from origins so `${origin}/uploads/` matching is exact. */
export function normalizeOrigins(origins: string[]): string[] {
  return origins.map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
}

/**
 * Classifies a media value. Self-origin requires an EXACT origin match on a
 * `/uploads/` path, so an external URL is never mis-classified as self (which
 * would relativize it into a broken — but local-looking — path).
 */
export function classifyMediaUrl(value: string, selfOrigins: string[]): MediaClassification {
  if (isLocalUploadPath(value)) return "local";
  for (const origin of selfOrigins) {
    if (value.startsWith(`${origin}/uploads/`)) return "self-origin";
  }
  return "external";
}

/** Collapses a self-origin absolute upload URL to its `/uploads/...` path (else returns it unchanged). */
export function relativizeSelfOrigin(value: string, selfOrigins: string[]): string {
  for (const origin of selfOrigins) {
    if (value.startsWith(`${origin}/uploads/`)) return value.slice(origin.length);
  }
  return value;
}

/** A non-local media reference found in a stem, with its classification. */
export interface MediaRef {
  value: string;
  classification: Exclude<MediaClassification, "local">;
}

/**
 * Side-effect-free scan of a stem for every distinct non-local media reference.
 * Used by the migration's dry-run report (no rehosting / no DB writes).
 */
export function collectStemMedia(html: string, selfOrigins: string[]): MediaRef[] {
  const seen = new Map<string, Exclude<MediaClassification, "local">>();
  rewriteEmbeddedMedia(html, (value) => {
    if (!isLocalUploadPath(value) && !seen.has(value)) {
      const classification = classifyMediaUrl(value, selfOrigins);
      if (classification !== "local") seen.set(value, classification);
    }
    return "keep";
  });
  return [...seen].map(([value, classification]) => ({ value, classification }));
}

/** Resolves one non-local media value to a concrete {@link MediaAction}. */
async function resolveMediaValue(value: string, ctx: ScrubContext): Promise<MediaAction> {
  const classification = classifyMediaUrl(value, ctx.selfOrigins);
  if (classification === "local") return { kind: "keep", value };
  if (classification === "self-origin") {
    return { kind: "relativized", from: value, value: relativizeSelfOrigin(value, ctx.selfOrigins) };
  }
  const result = await ctx.rehost(value);
  if (result.ok) {
    return { kind: "rehosted", from: value, value: result.saved.url, saved: result.saved };
  }
  return ctx.stripFailed
    ? { kind: "dropped", from: value, reason: result.reason }
    : { kind: "failed", from: value, reason: result.reason };
}

/** Maps an action to the rewrite the HTML transform should apply for that token. */
function toRewrite(action: MediaAction): MediaRewrite {
  switch (action.kind) {
    case "relativized":
    case "rehosted":
      return { replace: action.value };
    case "dropped":
      return "drop";
    case "keep":
    case "failed":
      return "keep";
  }
}

/**
 * Scrubs every embedded media reference in a question stem. Distinct URLs are
 * rehosted once (deduplicated), then applied across all occurrences. Returns the
 * new HTML and the per-reference actions (for reporting + `media`-row inserts).
 */
export async function scrubStemMedia(
  html: string,
  ctx: ScrubContext
): Promise<{ html: string; changed: boolean; actions: MediaAction[] }> {
  // Pass 1 — collect distinct non-local values (sync walk, no mutation).
  const values = new Set<string>();
  rewriteEmbeddedMedia(html, (value) => {
    if (!isLocalUploadPath(value)) values.add(value);
    return "keep";
  });

  // Resolve each distinct value (the only async step).
  const resolutions = new Map<string, MediaAction>();
  for (const value of values) {
    resolutions.set(value, await resolveMediaValue(value, ctx));
  }

  // Pass 2 — apply decisions to every occurrence.
  const newHtml = rewriteEmbeddedMedia(html, (value) => {
    const action = resolutions.get(value);
    return action ? toRewrite(action) : "keep";
  });

  return { html: newHtml, changed: newHtml !== html, actions: [...resolutions.values()] };
}

/**
 * Scrubs a single option image URL. Returns the value to persist (`null` clears
 * the column when an external image is dropped) and the action taken.
 */
export async function scrubImageUrl(
  url: string,
  ctx: ScrubContext
): Promise<{ value: string | null; changed: boolean; action: MediaAction }> {
  const action = await resolveMediaValue(url, ctx);
  switch (action.kind) {
    case "keep":
      return { value: url, changed: false, action };
    case "relativized":
    case "rehosted":
      return { value: action.value, changed: action.value !== url, action };
    case "dropped":
      return { value: null, changed: true, action };
    case "failed":
      return { value: url, changed: false, action };
  }
}
