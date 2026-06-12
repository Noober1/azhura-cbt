import { describe, expect, it } from "vitest";
import { getTourSteps, type TourAnchor } from "../tour";

/** Anchors only an admin's nav rail shows (mirrors NAV gating in AppShell). */
const ADMIN_ONLY_ANCHORS: TourAnchor[] = [
  "dashboard",
  "groups",
  "students",
  "supervisors",
  "exams",
  "recap",
  "logs",
  "settings",
];

/** Anchors only a supervisor's nav rail shows. */
const SUPERVISOR_ONLY_ANCHORS: TourAnchor[] = ["supervisor-exams"];

/** Anchors both roles see. */
const SHARED_ANCHORS: TourAnchor[] = ["media", "monitoring"];

function anchorsOf(role: "admin" | "supervisor"): TourAnchor[] {
  return getTourSteps(role).map((s) => s.anchor);
}

describe("getTourSteps — role gating (#167)", () => {
  it("includes every admin menu (incl. dashboard, supervisors, logs) for admins", () => {
    const anchors = anchorsOf("admin");

    for (const anchor of [...ADMIN_ONLY_ANCHORS, ...SHARED_ANCHORS]) {
      expect(anchors).toContain(anchor);
    }
  });

  it("never shows supervisor-only menus to admins", () => {
    const anchors = anchorsOf("admin");

    for (const anchor of SUPERVISOR_ONLY_ANCHORS) {
      expect(anchors).not.toContain(anchor);
    }
  });

  it("includes Soal Ujian plus the shared menus for supervisors", () => {
    const anchors = anchorsOf("supervisor");

    for (const anchor of [...SUPERVISOR_ONLY_ANCHORS, ...SHARED_ANCHORS]) {
      expect(anchors).toContain(anchor);
    }
  });

  it("never shows admin-only menus to supervisors", () => {
    const anchors = anchorsOf("supervisor");

    for (const anchor of ADMIN_ONLY_ANCHORS) {
      expect(anchors).not.toContain(anchor);
    }
  });

  it("walks the nav in the order the operator works (dashboard first for admin)", () => {
    expect(anchorsOf("admin")).toEqual([
      "dashboard",
      "groups",
      "students",
      "supervisors",
      "exams",
      "media",
      "monitoring",
      "recap",
      "logs",
      "settings",
    ]);
    expect(anchorsOf("supervisor")).toEqual(["supervisor-exams", "media", "monitoring"]);
  });
});

describe("getTourSteps — numbering & copy", () => {
  it.each(["admin", "supervisor"] as const)(
    "numbers %s steps 1..n with no gaps after filtering",
    (role) => {
      const steps = getTourSteps(role);

      steps.forEach((step, i) => {
        expect(step.title.startsWith(`${i + 1}. `)).toBe(true);
      });
    }
  );

  it.each(["admin", "supervisor"] as const)(
    "gives every %s step a non-empty title and description",
    (role) => {
      for (const step of getTourSteps(role)) {
        expect(step.title.length).toBeGreaterThan(3);
        expect(step.description.length).toBeGreaterThan(10);
      }
    }
  );

  it("labels the new menus with their nav names", () => {
    const titles = getTourSteps("admin").map((s) => s.title);

    expect(titles).toContain("1. Dashboard");
    expect(titles.some((t) => t.endsWith(". Pengawas"))).toBe(true);
    expect(titles.some((t) => t.endsWith(". Log"))).toBe(true);
    expect(getTourSteps("supervisor")[0]?.title).toBe("1. Soal Ujian");
  });
});
