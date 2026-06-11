/**
 * Azhura CBT Console — Product tour engine (#132).
 *
 * A thin wrapper over driver.js that powers the first-run nav tour. The tour
 * walks the operator through the core navigation in the order they will use it,
 * with a plain-Indonesian explanation on each stop.
 *
 * Responsibilities:
 *  - Build the tour steps (each anchored to a nav item via `data-tour`).
 *  - Run the tour (skippable + replayable).
 *  - Auto-run it exactly once, the first time the operator reaches the
 *    dashboard after setup/login, tracked by a localStorage flag.
 *  - Respect `prefers-reduced-motion`: driver.js animations are disabled when
 *    the operator has asked for reduced motion.
 *
 * Steps target elements by `[data-tour="<id>"]`; the nav rail in AppShell tags
 * each item so the selectors resolve. driver.js is imported lazily so its code
 * and CSS only load when a tour actually runs.
 */

import type { Config, DriveStep } from "driver.js";
import { toast } from "../stores/toast";

/** localStorage flag: set once the first-run tour has been seen (skipped or finished). */
export const ONBOARDING_DONE_KEY = "azhura_console_onboarding_done";

/** Stable ids used both here (as selectors) and on the nav items (`data-tour`). */
export type TourAnchor =
  | "groups"
  | "students"
  | "exams"
  | "media"
  | "monitoring"
  | "recap"
  | "settings";

interface TourStepDef {
  anchor: TourAnchor;
  title: string;
  description: string;
}

/**
 * The first-run navigation tour, in the order an operator naturally works:
 * set up grup → peserta → ujian & soal → media → monitoring → rekap → pengaturan.
 */
const TOUR_STEPS: TourStepDef[] = [
  {
    anchor: "groups",
    title: "1. Grup",
    description:
      "Mulai di sini. Buat grup untuk mengelompokkan peserta, misalnya per kelas. Setiap ujian nanti ditugaskan ke grup.",
  },
  {
    anchor: "students",
    title: "2. Peserta",
    description:
      "Tambahkan peserta ujian, satu per satu atau banyak sekaligus dari sebuah file. Masukkan setiap peserta ke grupnya.",
  },
  {
    anchor: "exams",
    title: "3. Ujian & Soal",
    description:
      "Buat paket ujian, susun soalnya, lalu tentukan grup mana yang boleh mengerjakan dan siapa pengawasnya.",
  },
  {
    anchor: "media",
    title: "4. Media",
    description:
      "Simpan gambar, audio, atau video di sini lebih dulu, supaya bisa Anda sisipkan ke dalam soal.",
  },
  {
    anchor: "monitoring",
    title: "5. Monitoring",
    description:
      "Saat ujian berlangsung, pantau peserta secara langsung: lihat sisa waktu, kirim pesan, atau bantu peserta yang bermasalah.",
  },
  {
    anchor: "recap",
    title: "6. Rekap Nilai",
    description:
      "Setelah ujian selesai, lihat hasil dan nilai peserta di sini — per ujian maupun per peserta.",
  },
  {
    anchor: "settings",
    title: "7. Pengaturan",
    description:
      "Atur identitas sekolah dan nilai bawaan ujian. Tur ini bisa Anda putar ulang kapan saja lewat tombol bantuan (?) di kanan atas.",
  },
];

const isBrowser = typeof window !== "undefined";

/** True when the operator has asked the system to reduce motion. */
function prefersReducedMotion(): boolean {
  if (!isBrowser || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Has the first-run tour already been seen on this device? */
export function hasSeenOnboarding(): boolean {
  if (!isBrowser) return true;
  try {
    return localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
  } catch {
    // If storage is unavailable, treat as "seen" so we never trap the operator
    // in a tour that re-runs on every visit.
    return true;
  }
}

/** Persist that the tour has been seen so it does not auto-run again. */
export function markOnboardingSeen(): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(ONBOARDING_DONE_KEY, "1");
  } catch {
    // Best-effort only; a failed write just means it may auto-run again later.
  }
}

function toDriveSteps(): DriveStep[] {
  return TOUR_STEPS.map((step) => ({
    element: `[data-tour="${step.anchor}"]`,
    popover: {
      title: step.title,
      description: step.description,
      side: "right",
      align: "start",
    },
  }));
}

/**
 * Runs the product tour. driver.js (and its CSS) is imported lazily so it only
 * loads on demand. `onDone` fires once the tour is closed (skipped or finished).
 */
export async function runTour(onDone?: () => void): Promise<void> {
  if (!isBrowser) return;

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
    steps: toDriveSteps(),
    // Fires once the tour is closed (skip, close, or final "Selesai"). It is the
    // correct hook here because we do NOT define `onDestroyStarted` — driver.js
    // only short-circuits before `onDestroyed` when that hook is present.
    onDestroyed: () => {
      onDone?.();
    },
  };

  const instance = driverFactory(config);
  instance.drive();
}

/**
 * Auto-runs the tour once after the operator first lands on the dashboard.
 * Marks it seen immediately so a refresh mid-tour does not replay it. Safe to
 * call on every dashboard mount — it is a no-op once the flag is set.
 */
export function maybeAutoRunTour(): void {
  if (!isBrowser || hasSeenOnboarding()) return;
  markOnboardingSeen();
  // Defer one frame so the dashboard paints before the overlay appears — the
  // nav rail (which carries the [data-tour] anchors) is already mounted by the
  // time this runs.
  requestAnimationFrame(() => {
    void runTour();
  });
}

/** Replays the tour on demand (e.g. from the header tutorial dialog). */
export function replayTour(): void {
  void runTour();
}
