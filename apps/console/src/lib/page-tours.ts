/**
 * Azhura CBT Console — Page-level tour runner (#165).
 *
 * A small driver.js runner for on-demand, per-page product tours (exam detail,
 * question form). It intentionally does NOT touch `lib/tour.ts` — that module
 * owns the first-run navigation tour and is being refactored separately — so a
 * tiny bit of driver.js config is duplicated here on purpose to keep the two
 * features merge-independent. The popover reuses the `.azhura-tour` class from
 * `index.css` so every tour in the console looks the same.
 *
 * Steps anchor to elements via data attributes (`data-tour-page` /
 * `data-tour-form`); step definitions live in `exam-detail-tour.ts` and
 * `question-type-tours.ts`. driver.js (and its CSS) is imported lazily so it
 * only loads when an operator actually starts a tour.
 */

import type { Config, DriveStep, Driver } from "driver.js";
import { toast } from "../stores/toast";

/** One stop in a page tour: a CSS selector plus its plain-Indonesian copy. */
export interface PageTourStep {
  /** CSS selector of the element to highlight (a data-attribute anchor). */
  element: string;
  /** Short popover title. */
  title: string;
  /** Plain-Indonesian explanation for school operators. No jargon. */
  description: string;
}

const isBrowser = typeof window !== "undefined";

/**
 * The one running tour, if any. driver.js mounts its overlay on
 * `document.body`, so it outlives React unmounts — pages must explicitly tear
 * it down on navigation, and starting a new tour must destroy the old one
 * (otherwise rapid clicks stack overlays).
 */
let activeDriver: Driver | null = null;

/** Tears down the running page tour, if any. Safe to call when none runs. */
export function destroyActivePageTour(): void {
  activeDriver?.destroy();
  activeDriver = null;
}

/** True when the operator has asked the system to reduce motion. */
function prefersReducedMotion(): boolean {
  if (!isBrowser || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function toDriveSteps(steps: readonly PageTourStep[]): DriveStep[] {
  return steps.map((step) => ({
    element: step.element,
    popover: {
      title: step.title,
      description: step.description,
    },
  }));
}

/**
 * Runs a page tour with the given steps. Safe to call from any click handler;
 * a load failure surfaces as a toast instead of throwing.
 */
export async function runPageTour(steps: readonly PageTourStep[]): Promise<void> {
  if (!isBrowser || steps.length === 0) return;

  let driverFactory: typeof import("driver.js")["driver"];
  try {
    // Lazy-load the engine + styles only when a tour actually runs.
    const [mod] = await Promise.all([
      import("driver.js"),
      import("driver.js/dist/driver.css"),
    ]);
    driverFactory = mod.driver;
  } catch {
    toast.error("Tur tidak bisa dimuat. Coba lagi nanti.");
    return;
  }

  const config: Config = {
    animate: !prefersReducedMotion(),
    showProgress: true,
    allowClose: true,
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 8,
    popoverClass: "azhura-tour",
    nextBtnText: "Lanjut",
    prevBtnText: "Kembali",
    doneBtnText: "Selesai",
    progressText: "Langkah {{current}} dari {{total}}",
    steps: toDriveSteps(steps),
    onDestroyed: () => {
      activeDriver = null;
    },
  };

  // Never let two tours overlap (e.g. a double-click on the trigger).
  destroyActivePageTour();
  activeDriver = driverFactory(config);
  activeDriver.drive();
}
