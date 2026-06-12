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
  | "dashboard"
  | "groups"
  | "students"
  | "supervisors"
  | "exams"
  | "supervisor-exams"
  | "media"
  | "monitoring"
  | "recap"
  | "logs"
  | "settings";

/** Console roles that can take the tour (students never see the console). */
export type TourRole = "admin" | "supervisor";

interface TourStepDef {
  anchor: TourAnchor;
  /** Title WITHOUT the step number — numbering is applied per-role, after filtering. */
  title: string;
  description: string;
  /** Roles whose nav rail shows this item (mirrors the NAV gating in AppShell). */
  roles: readonly TourRole[];
}

/** A role-filtered, numbered tour step, ready to feed driver.js. */
export interface NumberedTourStep {
  anchor: TourAnchor;
  title: string;
  description: string;
}

/**
 * The first-run navigation tour, in the order an operator naturally works:
 * dashboard → grup → peserta → pengawas → ujian & soal → media → monitoring →
 * rekap → log → pengaturan. Supervisors get a much shorter walk (soal ujian →
 * media → monitoring) because their rail only shows those items; the `roles`
 * field keeps each step aligned with the NAV gating in AppShell, and step
 * numbers are assigned AFTER filtering so both roles see "1..n" with no gaps.
 */
const TOUR_STEPS: readonly TourStepDef[] = [
  {
    anchor: "dashboard",
    title: "Dashboard",
    roles: ["admin"],
    description:
      "Halaman ringkasan. Lihat sekilas jumlah peserta, ujian yang sedang berjalan, dan hasil terbaru — tempat Anda mendarat setiap kali masuk.",
  },
  {
    anchor: "groups",
    title: "Grup",
    roles: ["admin"],
    description:
      "Mulai di sini. Buat grup untuk mengelompokkan peserta, misalnya per kelas. Setiap ujian nanti ditugaskan ke grup.",
  },
  {
    anchor: "students",
    title: "Peserta",
    roles: ["admin"],
    description:
      "Tambahkan peserta ujian, satu per satu atau banyak sekaligus dari sebuah file. Masukkan setiap peserta ke grupnya.",
  },
  {
    anchor: "supervisors",
    title: "Pengawas",
    roles: ["admin"],
    description:
      "Kelola akun pengawas di sini. Merekalah yang nanti memantau jalannya ujian dan membantu peserta yang bermasalah.",
  },
  {
    anchor: "exams",
    title: "Ujian & Soal",
    roles: ["admin"],
    description:
      "Buat paket ujian, susun soalnya, lalu tentukan grup mana yang boleh mengerjakan dan siapa pengawasnya.",
  },
  {
    anchor: "supervisor-exams",
    title: "Soal Ujian",
    roles: ["supervisor"],
    description:
      "Lihat paket ujian yang Anda awasi beserta soal-soalnya, supaya Anda tahu apa yang dikerjakan peserta.",
  },
  {
    anchor: "media",
    title: "Media",
    roles: ["admin", "supervisor"],
    description:
      "Simpan gambar, audio, atau video di sini lebih dulu, supaya bisa Anda sisipkan ke dalam soal.",
  },
  {
    anchor: "monitoring",
    title: "Monitoring",
    roles: ["admin", "supervisor"],
    description:
      "Saat ujian berlangsung, pantau peserta secara langsung: lihat sisa waktu, kirim pesan, atau bantu peserta yang bermasalah.",
  },
  {
    anchor: "recap",
    title: "Rekap Nilai",
    roles: ["admin"],
    description:
      "Setelah ujian selesai, lihat hasil dan nilai peserta di sini — per ujian maupun per peserta.",
  },
  {
    anchor: "logs",
    title: "Log",
    roles: ["admin"],
    description:
      "Catatan aktivitas sistem: siapa masuk, kapan ujian dimulai, dan kejadian penting lainnya. Berguna saat menelusuri masalah.",
  },
  {
    anchor: "settings",
    title: "Pengaturan",
    roles: ["admin"],
    description:
      "Atur identitas sekolah dan nilai bawaan ujian. Tur ini bisa Anda putar ulang kapan saja lewat tombol bantuan (?) di kanan atas.",
  },
];

/**
 * Returns the tour steps visible to `role`, renumbered 1..n after filtering so
 * the progression never shows gaps. Exposed (and unit-tested) so the step list
 * stays the single source of truth for what each role is shown.
 */
export function getTourSteps(role: TourRole): NumberedTourStep[] {
  return TOUR_STEPS.filter((step) => step.roles.includes(role)).map((step, i) => ({
    anchor: step.anchor,
    title: `${i + 1}. ${step.title}`,
    description: step.description,
  }));
}

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

function toDriveSteps(role: TourRole): DriveStep[] {
  return getTourSteps(role).map((step) => ({
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
 * Runs the product tour for `role` (only the nav items that role can see are
 * highlighted). driver.js (and its CSS) is imported lazily so it only loads on
 * demand. `onDone` fires once the tour is closed (skipped or finished).
 */
export async function runTour(role: TourRole, onDone?: () => void): Promise<void> {
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
    steps: toDriveSteps(role),
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
export function maybeAutoRunTour(role: TourRole): void {
  if (!isBrowser || hasSeenOnboarding()) return;
  markOnboardingSeen();
  // Defer one frame so the dashboard paints before the overlay appears — the
  // nav rail (which carries the [data-tour] anchors) is already mounted by the
  // time this runs.
  requestAnimationFrame(() => {
    void runTour(role);
  });
}

/** Replays the tour on demand (e.g. from the header tutorial dialog). */
export function replayTour(role: TourRole): void {
  void runTour(role);
}
