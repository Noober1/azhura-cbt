/**
 * Help tutorial asset resolution (#180) — pure pick logic.
 *
 * The registry is injectable, so we verify the poster-vs-animated decision
 * without real .webp files:
 *  - reduced motion prefers the static `<step>.poster.webp` frame;
 *  - reduced motion without a poster still falls back to the animation;
 *  - normal motion always picks the animation;
 *  - missing assets resolve to `null` (the carousel placeholder).
 */

import { describe, expect, it } from "vitest";
import { pickHelpImage, posterImageOf, type HelpAssetLoader } from "../help-assets";

const animated: HelpAssetLoader = () => Promise.resolve("/built/groups-1.webp");
const poster: HelpAssetLoader = () => Promise.resolve("/built/groups-1.poster.webp");

const FULL_REGISTRY: Record<string, HelpAssetLoader> = {
  "../assets/help/groups/1.webp": animated,
  "../assets/help/groups/1.poster.webp": poster,
};

describe("posterImageOf", () => {
  it("derives the poster name from the animated name", () => {
    expect(posterImageOf("groups/1.webp")).toBe("groups/1.poster.webp");
  });

  it("only rewrites the final .webp extension", () => {
    expect(posterImageOf("exams/intro.webp.webp")).toBe("exams/intro.webp.poster.webp");
  });
});

describe("pickHelpImage", () => {
  it("picks the animated asset when motion is allowed", () => {
    expect(pickHelpImage("groups/1.webp", false, FULL_REGISTRY)).toBe(animated);
  });

  it("prefers the static poster under reduced motion", () => {
    expect(pickHelpImage("groups/1.webp", true, FULL_REGISTRY)).toBe(poster);
  });

  it("falls back to the animation under reduced motion when no poster exists", () => {
    const registry = { "../assets/help/groups/1.webp": animated };
    expect(pickHelpImage("groups/1.webp", true, registry)).toBe(animated);
  });

  it("returns null when the asset is missing entirely", () => {
    expect(pickHelpImage("media/9.webp", false, FULL_REGISTRY)).toBeNull();
    expect(pickHelpImage("media/9.webp", true, FULL_REGISTRY)).toBeNull();
  });

  it("defaults to the real (possibly empty) registry without crashing", () => {
    // No assets are committed yet, so the bundled registry resolves nothing.
    expect(pickHelpImage("groups/1.webp", false)).toBeNull();
  });
});
