/**
 * Help-content registry tests (#165).
 *
 * The console's vitest harness is Node-only (no jsdom — see vitest.config.ts),
 * so page render coverage lives in E2E. Here we guard the two things unit tests
 * can own:
 *  1. every `HelpTopic` has a complete, well-formed `HELP_CONTENT` entry
 *     (non-empty title/body, no empty steps), including the topics added for
 *     exam detail, sessions, the question form, and supervisors;
 *  2. each target page actually wires a `<PageHelpButton/>` to its topic, via a
 *     lightweight source check (the Node stand-in for a render test).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HELP_CONTENT, type HelpTopic } from "../help-content";

const NEW_TOPICS: HelpTopic[] = [
  "examDetail",
  "examSessions",
  "questionForm",
  "supervisors",
];

describe("HELP_CONTENT registry", () => {
  it.each(Object.entries(HELP_CONTENT))(
    "entry %s has a non-empty title and body",
    (_topic, entry) => {
      expect(entry.title.trim()).not.toBe("");
      expect(entry.body.length).toBeGreaterThan(0);
      for (const paragraph of entry.body) {
        expect(paragraph.trim()).not.toBe("");
      }
    }
  );

  it.each(Object.entries(HELP_CONTENT))(
    "entry %s has no empty steps when steps are present",
    (_topic, entry) => {
      if (!entry.steps) return;
      expect(entry.steps.length).toBeGreaterThan(0);
      for (const step of entry.steps) {
        expect(step.trim()).not.toBe("");
      }
    }
  );

  it.each(NEW_TOPICS)("has an entry for the new topic %s", (topic) => {
    expect(HELP_CONTENT[topic]).toBeDefined();
    expect(HELP_CONTENT[topic].title.trim()).not.toBe("");
  });

  it.each(Object.entries(HELP_CONTENT))(
    "entry %s has well-formed tutorial steps when a tutorial is present (#180)",
    (_topic, entry) => {
      if (!entry.tutorial) return;
      expect(entry.tutorial.length).toBeGreaterThan(0);
      for (const step of entry.tutorial) {
        // Assets live at src/assets/help/<topic>/<step>.webp. The image must
        // be the animated asset — posters (.poster.webp) are derived by
        // pickHelpImage and must never be referenced directly.
        expect(step.image).toMatch(/^[\w-]+\/[\w.-]+\.webp$/);
        expect(step.image).not.toMatch(/\.poster\.webp$/);
        expect(step.title.trim()).not.toBe("");
        expect(step.description.trim()).not.toBe("");
      }
    }
  );
});

describe("page wiring — target pages render a help button for their topic", () => {
  const PAGE_TOPICS: Array<{ page: string; topic: HelpTopic }> = [
    { page: "../../components/exams/ExamDetailPage.tsx", topic: "examDetail" },
    { page: "../../components/exams/ExamSessionsPage.tsx", topic: "examSessions" },
    { page: "../../components/questions/AdminQuestionFormPage.tsx", topic: "questionForm" },
    { page: "../../components/supervisors/SupervisorListPage.tsx", topic: "supervisors" },
  ];

  it.each(PAGE_TOPICS)("$page uses <PageHelpButton topic=\"$topic\"/>", ({ page, topic }) => {
    const source = readFileSync(fileURLToPath(new URL(page, import.meta.url)), "utf8");
    expect(source).toContain('from "../ui/PageHelpButton"');
    expect(source).toContain(`<PageHelpButton topic="${topic}" />`);
  });
});
