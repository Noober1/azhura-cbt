/**
 * Azhura CBT Console — mc-options helper tests (#163).
 *
 * Covers the pure multiple-choice option draft operations shared by the admin
 * and supervisor question forms: hydration, text/image updates (immutable),
 * add/remove rows, correct-index adjustment, and payload serialization.
 */

import { describe, expect, it } from "vitest";
import {
  EMPTY_OPTION_HTML,
  adjustCorrectIndexAfterRemove,
  appendOption,
  clearOptionImage,
  createDefaultOptions,
  createEmptyOption,
  hydrateOptions,
  removeOptionAt,
  setOptionImage,
  toOptionPayload,
  updateOptionText,
  type McOptionDraft,
} from "../mc-options";

const IMG = "/uploads/images/abc.jpg";

function drafts(): McOptionDraft[] {
  return [
    { text: "<p>Satu</p>", imageUrl: null },
    { text: "<p>Dua</p>", imageUrl: IMG },
    { text: "<p>Tiga</p>", imageUrl: null },
  ];
}

describe("createEmptyOption / createDefaultOptions", () => {
  it("creates a blank draft with no image", () => {
    expect(createEmptyOption()).toEqual({ text: EMPTY_OPTION_HTML, imageUrl: null });
  });

  it("creates four independent blank options by default", () => {
    const list = createDefaultOptions();
    expect(list).toHaveLength(4);
    expect(new Set(list.map((o) => o.imageUrl))).toEqual(new Set([null]));
    // Independent objects — mutating one must not affect siblings.
    expect(list[0]).not.toBe(list[1]);
  });
});

describe("hydrateOptions", () => {
  it("maps persisted options including their imageUrl", () => {
    const out = hydrateOptions(
      [
        { text: "<p>A</p>", imageUrl: IMG },
        { text: "<p>B</p>", imageUrl: null },
      ],
      2,
      6
    );
    expect(out).toEqual([
      { text: "<p>A</p>", imageUrl: IMG },
      { text: "<p>B</p>", imageUrl: null },
    ]);
  });

  it("pads with blanks up to the minimum", () => {
    const out = hydrateOptions([{ text: "<p>A</p>", imageUrl: null }], 2, 6);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual(createEmptyOption());
  });

  it("caps at the maximum", () => {
    const persisted = Array.from({ length: 8 }, (_, i) => ({
      text: `<p>${i}</p>`,
      imageUrl: null,
    }));
    expect(hydrateOptions(persisted, 2, 6)).toHaveLength(6);
  });

  it("falls back to blank HTML for empty text and null for missing imageUrl", () => {
    const out = hydrateOptions([{ text: "", imageUrl: undefined as unknown as null }], 1, 6);
    expect(out[0]).toEqual({ text: EMPTY_OPTION_HTML, imageUrl: null });
  });
});

describe("updateOptionText", () => {
  it("replaces only the targeted option's text, preserving its image", () => {
    const before = drafts();
    const after = updateOptionText(before, 1, "<p>Baru</p>");
    expect(after[1]).toEqual({ text: "<p>Baru</p>", imageUrl: IMG });
    expect(after[0]).toEqual(before[0]);
    // Immutability: the original list is untouched.
    expect(before[1].text).toBe("<p>Dua</p>");
    expect(after).not.toBe(before);
  });
});

describe("setOptionImage / clearOptionImage", () => {
  it("attaches an image to the targeted option only", () => {
    const after = setOptionImage(drafts(), 0, IMG);
    expect(after[0].imageUrl).toBe(IMG);
    expect(after[2].imageUrl).toBeNull();
  });

  it("replaces an existing image", () => {
    const after = setOptionImage(drafts(), 1, "/uploads/images/other.png");
    expect(after[1].imageUrl).toBe("/uploads/images/other.png");
  });

  it("clears the image without touching the text", () => {
    const before = drafts();
    const after = clearOptionImage(before, 1);
    expect(after[1]).toEqual({ text: "<p>Dua</p>", imageUrl: null });
    expect(before[1].imageUrl).toBe(IMG);
  });
});

describe("appendOption / removeOptionAt", () => {
  it("appends a blank option below the cap", () => {
    const after = appendOption(drafts(), 6);
    expect(after).toHaveLength(4);
    expect(after[3]).toEqual(createEmptyOption());
  });

  it("does not append at the cap", () => {
    const before = drafts();
    expect(appendOption(before, 3)).toBe(before);
  });

  it("removes the targeted option above the floor", () => {
    const after = removeOptionAt(drafts(), 1, 2);
    expect(after.map((o) => o.text)).toEqual(["<p>Satu</p>", "<p>Tiga</p>"]);
  });

  it("does not remove at the floor", () => {
    const before = drafts();
    expect(removeOptionAt(before, 0, 3)).toBe(before);
  });
});

describe("adjustCorrectIndexAfterRemove", () => {
  it("resets to 0 when the correct option is removed", () => {
    expect(adjustCorrectIndexAfterRemove(2, 2)).toBe(0);
  });

  it("shifts left when an earlier option is removed", () => {
    expect(adjustCorrectIndexAfterRemove(2, 0)).toBe(1);
  });

  it("keeps the index when a later option is removed", () => {
    expect(adjustCorrectIndexAfterRemove(1, 2)).toBe(1);
  });
});

describe("toOptionPayload", () => {
  it("serializes text and imageUrl for every draft", () => {
    expect(toOptionPayload(drafts())).toEqual([
      { text: "<p>Satu</p>", imageUrl: null },
      { text: "<p>Dua</p>", imageUrl: IMG },
      { text: "<p>Tiga</p>", imageUrl: null },
    ]);
  });
});
