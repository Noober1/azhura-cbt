/**
 * Azhura CBT App - Screen Resolution Check (#48)
 *
 * The exam UI is designed for a minimum screen resolution of 1280×720. Below
 * that, the layout can clip or become unreadable mid-exam. This module holds
 * the minimum thresholds and a pure check so it can be unit-tested without a
 * DOM, while `ResolutionGuard` reads the real `window.screen` at startup.
 *
 * Works the same in web and Tauri: `window.screen.{width,height}` reports the
 * monitor's logical (CSS-pixel) resolution in both contexts, so no Tauri-only
 * screen API is required.
 */

/** Minimum supported screen width in CSS pixels. */
export const MIN_SCREEN_WIDTH = 1280;

/** Minimum supported screen height in CSS pixels. */
export const MIN_SCREEN_HEIGHT = 720;

/**
 * Returns `true` when the given resolution meets the minimum on both axes.
 *
 * Non-finite or non-positive values (e.g. when `window.screen` is unavailable)
 * are treated as sufficient so the app never blocks itself on a bad reading.
 *
 * @param width  Screen width in CSS pixels (`window.screen.width`).
 * @param height Screen height in CSS pixels (`window.screen.height`).
 */
export const isResolutionSufficient = (width: number, height: number): boolean => {
  // A missing/garbage reading must not lock the user out — fail open.
  if (!Number.isFinite(width) || !Number.isFinite(height)) return true;
  if (width <= 0 || height <= 0) return true;

  return width >= MIN_SCREEN_WIDTH && height >= MIN_SCREEN_HEIGHT;
};
