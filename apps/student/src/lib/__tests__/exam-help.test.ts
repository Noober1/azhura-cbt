import { describe, it, expect } from "vitest";
import {
  EXAM_HELP_SECTIONS,
  EXAM_SHORTCUT_LEGEND,
  getExamHelpVisibility,
  type ExamHelpTopicId,
} from "../exam-help";

/**
 * The in-exam help dialog (#166) must stay reachable under lockdown — unlike
 * the driver.js tour (#145), which stays safe-context only. These tests pin
 * the visibility rule and the required content topics + shortcut legend
 * (#178), DOM-free per the node vitest env (components are covered by E2E).
 */

describe("getExamHelpVisibility", () => {
  it("keeps the static help dialog available while enforcement is active", () => {
    expect(getExamHelpVisibility(true).staticHelp).toBe(true);
  });

  it("hides only the tour replay under enforcement", () => {
    expect(getExamHelpVisibility(true).tourReplay).toBe(false);
  });

  it("shows both help affordances outside lockdown", () => {
    expect(getExamHelpVisibility(false)).toEqual({ staticHelp: true, tourReplay: true });
  });
});

describe("EXAM_HELP_SECTIONS", () => {
  it("covers every required topic from #166 exactly once", () => {
    const required: ExamHelpTopicId[] = ["timer", "grid", "flag", "autosave", "submit"];
    expect(EXAM_HELP_SECTIONS.map((s) => s.id).sort()).toEqual([...required].sort());
  });

  it("has non-empty Indonesian copy for every section", () => {
    for (const section of EXAM_HELP_SECTIONS) {
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.description.length).toBeGreaterThan(20);
    }
  });

  it("explains auto-submit and the grid status colors", () => {
    const timer = EXAM_HELP_SECTIONS.find((s) => s.id === "timer");
    expect(timer?.description).toMatch(/otomatis/i);
    const grid = EXAM_HELP_SECTIONS.find((s) => s.id === "grid");
    expect(grid?.description).toMatch(/biru/i);
    expect(grid?.description).toMatch(/ragu/i);
  });
});

describe("EXAM_SHORTCUT_LEGEND", () => {
  it("lists every shortcut from #178", () => {
    const keys = EXAM_SHORTCUT_LEGEND.map((i) => i.keys).join(" ");
    expect(keys).toContain("←");
    expect(keys).toContain("→");
    expect(keys).toContain("A – F");
    expect(keys).toContain("R");
    expect(keys).toContain("Enter");
  });

  it("describes each shortcut", () => {
    for (const item of EXAM_SHORTCUT_LEGEND) {
      expect(item.description.length).toBeGreaterThan(0);
    }
  });
});
