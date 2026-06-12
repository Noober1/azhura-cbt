/**
 * Page-tour definition tests (#165).
 *
 * The console's vitest harness is Node-only (no jsdom — see vitest.config.ts),
 * so actually driving driver.js is E2E territory. Here we guard what unit
 * tests can own:
 *  1. the exam-detail tour and every per-question-type tour have complete,
 *     well-formed steps (non-empty titles/descriptions, unique anchors);
 *  2. every anchor a tour targets really exists in the page/form sources as a
 *     `data-tour-page` / `data-tour-form` attribute (the Node stand-in for a
 *     render test), so no step can point at nothing;
 *  3. the pages wire the trigger buttons to the tour runners.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { QuestionType } from "@azhura/shared";
import { EXAM_DETAIL_TOUR_STEPS } from "../exam-detail-tour";
import { QUESTION_TYPE_TOURS } from "../question-type-tours";

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const ALL_QUESTION_TYPES: QuestionType[] = [
  "multiple_choice",
  "fill_in_blank",
  "matching",
  "sorting",
];

describe("exam detail tour definition", () => {
  it("has at least four steps covering the page's key areas", () => {
    expect(EXAM_DETAIL_TOUR_STEPS.length).toBeGreaterThanOrEqual(4);
  });

  it("every step has a non-empty title and description", () => {
    for (const step of EXAM_DETAIL_TOUR_STEPS) {
      expect(step.title.trim()).not.toBe("");
      expect(step.description.trim()).not.toBe("");
    }
  });

  it("anchors are unique", () => {
    const anchors = EXAM_DETAIL_TOUR_STEPS.map((s) => s.anchor);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it("every anchor exists on ExamDetailPage as a data-tour-page attribute", () => {
    const source = readSource("../../components/exams/ExamDetailPage.tsx");
    for (const step of EXAM_DETAIL_TOUR_STEPS) {
      expect(source).toContain(`data-tour-page="${step.anchor}"`);
    }
  });
});

describe("exam detail tour wiring", () => {
  it("ExamDetailPage renders a tour trigger next to the help button", () => {
    const source = readSource("../../components/exams/ExamDetailPage.tsx");
    expect(source).toContain('from "../../lib/exam-detail-tour"');
    expect(source).toContain("runExamDetailTour()");
    expect(source).toContain("Tur halaman");
  });
});

describe("question type tours definition", () => {
  it("covers exactly the four supported question types", () => {
    expect(Object.keys(QUESTION_TYPE_TOURS).sort()).toEqual([...ALL_QUESTION_TYPES].sort());
  });

  it.each(ALL_QUESTION_TYPES)("tour %s has a labelled trigger in the required format", (type) => {
    const tour = QUESTION_TYPE_TOURS[type];
    expect(tour.typeLabel.trim()).not.toBe("");
    expect(tour.buttonLabel).toMatch(/^Apa itu .+\?$/);
    expect(tour.buttonLabel).toContain(tour.typeLabel);
  });

  it.each(ALL_QUESTION_TYPES)("tour %s has well-formed, unique steps", (type) => {
    const { steps } = QUESTION_TYPE_TOURS[type];
    expect(steps.length).toBeGreaterThanOrEqual(4);
    for (const step of steps) {
      expect(step.title.trim()).not.toBe("");
      expect(step.description.trim()).not.toBe("");
    }
    const anchors = steps.map((s) => s.anchor);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it.each(ALL_QUESTION_TYPES)(
    "tour %s starts at the type selector and ends at the save actions",
    (type) => {
      const { steps } = QUESTION_TYPE_TOURS[type];
      expect(steps[0].anchor).toBe("question-type");
      expect(steps.at(-1)?.anchor).toBe("actions");
    }
  );

  it.each(ALL_QUESTION_TYPES)(
    "tour %s explains the question text editor",
    (type) => {
      const anchors = QUESTION_TYPE_TOURS[type].steps.map((s) => s.anchor);
      expect(anchors).toContain("question-text");
    }
  );

  it("every anchor exists in the question form sources as a data-tour-form attribute", () => {
    const combinedSource = [
      "../../components/questions/AdminQuestionFormPage.tsx",
      "../../components/questions/FillInBlankForm.tsx",
      "../../components/questions/MatchingForm.tsx",
      "../../components/questions/SortingForm.tsx",
    ]
      .map(readSource)
      .join("\n");
    for (const type of ALL_QUESTION_TYPES) {
      for (const step of QUESTION_TYPE_TOURS[type].steps) {
        expect(combinedSource).toContain(`data-tour-form="${step.anchor}"`);
      }
    }
  });
});

describe("question type tours wiring", () => {
  const formSource = () =>
    readSource("../../components/questions/AdminQuestionFormPage.tsx");

  it("AdminQuestionFormPage renders ONE adaptive trigger beside the type selector", () => {
    const source = formSource();
    expect(source).toContain('from "../../lib/question-type-tours"');
    // The trigger runs the tour for the ACTIVE type…
    expect(source).toContain("runQuestionTypeTour(questionType)");
    expect(source).toContain("startActiveTypeTour");
    // …and its label + icon adapt to that active type.
    expect(source).toContain("QUESTION_TYPE_TOURS[questionType].buttonLabel");
    expect(source).toContain("TYPE_TOUR_ICONS[questionType]");
    // No leftover per-type trigger wiring (the pre-revision design).
    expect(source).not.toContain("QUESTION_TYPE_TOURS[t]");
  });

  it.each(ALL_QUESTION_TYPES)("the adaptive trigger has an icon mapped for %s", (type) => {
    const source = formSource();
    // TYPE_TOUR_ICONS must cover every type so the adaptive button never
    // renders without an icon.
    expect(source).toMatch(new RegExp(`${type}:\\s*\\w+Icon`));
  });

  it("the mc-add-option anchor is always in the DOM (disabled at the cap, never unmounted)", () => {
    const source = formSource();
    // Conditionally unmounting the button would leave the tour step with no
    // element to highlight when a question already has the maximum options.
    expect(source).not.toContain("options.length < MAX_OPTIONS &&");
    expect(source).toContain("disabled={busy || options.length >= MAX_OPTIONS}");
  });
});

describe("tour lifecycle", () => {
  it("page-tours guards against overlapping tours and exposes a teardown", () => {
    const source = readSource("../page-tours.ts");
    expect(source).toContain("export function destroyActivePageTour");
    // A new tour must destroy the previous instance before driving.
    expect(source).toContain("destroyActivePageTour();");
    expect(source).toContain("onDestroyed");
  });

  it.each([
    "../../components/exams/ExamDetailPage.tsx",
    "../../components/questions/AdminQuestionFormPage.tsx",
  ])("%s tears the tour down on unmount", (page) => {
    const source = readSource(page);
    // The driver.js overlay lives on document.body, so each tour-hosting page
    // must destroy it when the operator navigates away mid-tour.
    expect(source).toContain("destroyActivePageTour()");
  });
});
