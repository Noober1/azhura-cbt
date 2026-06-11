/**
 * Azhura CBT Student — Product tour engine (#145).
 *
 * A thin wrapper over driver.js powering two guided tours, written in very
 * simple, student-friendly Indonesian (short sentences, concrete steps, and an
 * explicit warning that "Selesai" locks answers permanently). It mirrors the
 * console's onboarding approach (#132) but is a separate implementation — the
 * two apps never import each other's code.
 *
 *  - **Dashboard tour** — fully safe. The dashboard has no exam-scoped
 *    anti-cheat monitoring, so it auto-runs once per participant and can be
 *    replayed from a "Panduan" button.
 *  - **Exam-session tour** — SAFE-CONTEXT ONLY. See the anti-cheat safety note
 *    below; this tour NEVER auto-runs and is gated so it cannot appear while
 *    lockdown enforcement is active.
 *
 * ── ANTI-CHEAT SAFETY (read before changing) ─────────────────────────────────
 * During a live exam, `ExamLayout` mounts focus-loss + fullscreen-exit
 * detection (`startExamMonitoring`) and may force fullscreen + a kiosk window +
 * an OS keyboard hook (App.tsx). A tour shown on top of that could fight
 * fullscreen or look like a violation. Mitigations, in order:
 *   1. The exam-session tour is shown BEFORE lockdown — from the start-exam
 *      confirmation dialog, while still on the (safe) dashboard.
 *   2. The in-exam "Lihat panduan" button only appears, and the runner only
 *      proceeds, when enforcement is NOT active (`isEnforcementActive` is the
 *      single source of truth). When enforcement is on, there is no in-exam
 *      tour at all.
 * The driver.js overlay itself is purely in-DOM: it never opens a new
 * tab/window, never calls `alert`, never moves focus out of the window, and
 * never touches the Fullscreen API — so it cannot bypass or trip any anti-cheat
 * protection. driver.js (engine + CSS) is imported lazily so it only loads when
 * a tour actually runs.
 */

import type { Config, DriveStep } from "driver.js";
import type { AntiCheatConfig } from "@azhura/shared";
import { toast } from "sonner";
import { getFlag, setFlag } from "./storage";
import { createLogger } from "./logger";

const log = createLogger("Tour");

/** Flag-store key prefix; the participant id is appended (see {@link seenKey}). */
const TOUR_SEEN_KEY_PREFIX = "tour_seen_dashboard:";
/** Stored when a tour has been seen — value is informational only. */
const SEEN_VALUE = "1";

/** Which tour to run. */
export type TourKind = "dashboard" | "exam";

interface TourStepDef {
  /** `[data-tour]` id the step anchors to. */
  anchor: string;
  title: string;
  description: string;
  side?: NonNullable<DriveStep["popover"]>["side"];
  align?: NonNullable<DriveStep["popover"]>["align"];
}

/**
 * Dashboard tour — the order a student reads the screen: who am I → which exam
 * → how to start (incl. token) → am I connected → where to ask for help.
 */
const DASHBOARD_STEPS: TourStepDef[] = [
  {
    anchor: "participant-card",
    title: "Ini Kamu",
    description:
      "Cek dulu: ini nama dan kelas kamu, ya? Kalau bukan, beri tahu pengawas sebelum mulai.",
    side: "right",
    align: "start",
  },
  {
    anchor: "exam-list",
    title: "Daftar Ujian",
    description:
      "Ini ujian yang boleh kamu kerjakan hari ini. Lihat nama, jumlah soal, dan lama waktunya.",
    side: "left",
    align: "start",
  },
  {
    anchor: "exam-start",
    title: "Tombol Mulai",
    description:
      "Tekan \"Mulai Ujian\" pada baris ujian yang dipilih. Nanti muncul kotak konfirmasi dulu sebelum ujian benar-benar dimulai.",
    side: "left",
    align: "center",
  },
  {
    anchor: "exam-token",
    title: "Ujian Pakai Token",
    description:
      "Kalau ada gambar gembok dan tulisan \"Token\", kamu perlu kode dari pengawas untuk membukanya.",
    side: "left",
    align: "center",
  },
  {
    anchor: "chat-launcher",
    title: "Tombol Bantuan & Chat",
    description:
      "Ada pertanyaan? Tekan tombol ini untuk mengobrol dengan pengawas. Tombol tanda tanya (?) di atas untuk memutar ulang panduan ini.",
    side: "left",
    align: "end",
  },
];

/**
 * Exam-session tour — explains the live exam screen. Shown in a SAFE context
 * only (see file header). Walks the timer → soal → cara menjawab → navigasi →
 * ragu-ragu → pindah soal → tombol Selesai (with the permanence warning).
 */
const EXAM_STEPS: TourStepDef[] = [
  {
    anchor: "exam-timer",
    title: "Waktu Tersisa",
    description:
      "Ini sisa waktumu. Saat waktu habis, ujian dikumpulkan otomatis. Kerjakan dengan tenang, jangan terburu-buru.",
    side: "bottom",
    align: "end",
  },
  {
    anchor: "exam-question",
    title: "Soal & Cara Menjawab",
    description:
      "Baca soal di sini. Pilihan ganda: tekan satu jawaban. Isian: ketik jawabanmu. Pasangkan/urutkan: geser kartu ke tempat yang benar.",
    side: "top",
    align: "start",
  },
  {
    anchor: "exam-nav-grid",
    title: "Nomor Soal",
    description:
      "Semua nomor soal ada di sini. Biru = sudah dijawab, kuning = ragu-ragu, abu-abu = belum dijawab. Tekan nomornya untuk loncat ke soal itu.",
    side: "right",
    align: "start",
  },
  {
    anchor: "exam-flag",
    title: "Tombol Ragu-ragu",
    description:
      "Belum yakin? Tekan \"Ragu-ragu\" supaya soal ini ditandai kuning, jadi gampang kamu cek lagi nanti.",
    side: "top",
    align: "center",
  },
  {
    anchor: "exam-prevnext",
    title: "Pindah Soal",
    description:
      "Gunakan \"Sebelumnya\" dan \"Berikutnya\" untuk pindah soal. Jawabanmu tersimpan sendiri setiap kali memilih.",
    side: "top",
    align: "center",
  },
  {
    anchor: "exam-submit",
    title: "Tombol Selesai",
    description:
      "Tekan ini HANYA kalau sudah benar-benar selesai. \"Selesai\" mengunci semua jawaban secara permanen dan tidak bisa diubah lagi.",
    side: "top",
    align: "end",
  },
];

const STEPS_BY_KIND: Record<TourKind, TourStepDef[]> = {
  dashboard: DASHBOARD_STEPS,
  exam: EXAM_STEPS,
};

const isBrowser = typeof window !== "undefined";

/**
 * The single source of truth for "is exam lockdown enforcement active?".
 *
 * When `true`, the exam-session tour must NOT run: the student is (or is about
 * to be) under fullscreen / focus-loss detection / OS keyboard lock, where a
 * tour overlay is unwelcome. Pure and dependency-free so it is trivially unit-
 * testable and reusable by the UI to hide the in-exam help button.
 */
export function isEnforcementActive(config: AntiCheatConfig): boolean {
  if (!config.enabled) return false;
  return config.fullscreen || config.detectFocusLoss || config.blockOsKeyboard;
}

/** True when the participant has asked the system to reduce motion. */
function prefersReducedMotion(): boolean {
  if (!isBrowser || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Builds the per-participant flag key. Exam workstations are shared, so keying
 * by user id means each student gets the tour once on their first login rather
 * than inheriting the previous student's "seen" state. Falls back to a shared
 * device key when no user id is known (pre-login is never a tour context, so
 * this is just a safety net).
 */
function seenKey(userId: string | null): string {
  return TOUR_SEEN_KEY_PREFIX + (userId ?? "device");
}

/** Has this participant already seen the auto-run dashboard tour? */
export async function hasSeenDashboardTour(userId: string | null): Promise<boolean> {
  return (await getFlag(seenKey(userId))) === SEEN_VALUE;
}

/** Persists that this participant has seen the dashboard tour. */
export async function markDashboardTourSeen(userId: string | null): Promise<void> {
  await setFlag(seenKey(userId), SEEN_VALUE);
}

function toDriveSteps(kind: TourKind): DriveStep[] {
  return STEPS_BY_KIND[kind].map((step) => ({
    // Only render a step whose anchor is actually in the DOM. driver.js skips
    // `element`-less steps gracefully, so an absent anchor (e.g. the token hint
    // when no exam needs one, or the chat button when chat is disabled) simply
    // shows as a centered popover instead of breaking the tour.
    element:
      isBrowser && document.querySelector(`[data-tour="${step.anchor}"]`)
        ? `[data-tour="${step.anchor}"]`
        : undefined,
    popover: {
      title: step.title,
      description: step.description,
      side: step.side ?? "bottom",
      align: step.align ?? "start",
    },
  }));
}

/**
 * Runs a tour. driver.js (and its CSS) is imported lazily so it only loads on
 * demand. `onDone` fires once the tour is closed (skipped, closed, or finished
 * via "Selesai").
 */
export async function runTour(kind: TourKind, onDone?: () => void): Promise<void> {
  if (!isBrowser) return;

  let driverFactory: (typeof import("driver.js"))["driver"];
  try {
    const [mod] = await Promise.all([
      import("driver.js"),
      import("driver.js/dist/driver.css"),
    ]);
    driverFactory = mod.driver;
  } catch (error) {
    log.error("Failed to load tour engine", error);
    toast.error("Panduan tidak bisa dimuat. Coba lagi nanti.");
    onDone?.();
    return;
  }

  const config: Config = {
    // Disable driver.js animation when the OS asks for reduced motion.
    animate: !prefersReducedMotion(),
    showProgress: true,
    allowClose: true,
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 10,
    popoverClass: "azhura-tour",
    nextBtnText: "Lanjut",
    prevBtnText: "Kembali",
    doneBtnText: "Mengerti",
    progressText: "Langkah {{current}} dari {{total}}",
    steps: toDriveSteps(kind),
    // Fires once the tour is closed (skip, close, or final button). Correct hook
    // here because we do NOT define `onDestroyStarted` — driver.js only short-
    // circuits before `onDestroyed` when that hook is present.
    onDestroyed: () => {
      onDone?.();
    },
  };

  driverFactory(config).drive();
}

/**
 * Auto-runs the dashboard tour exactly once per participant, the first time
 * they reach the dashboard. Marks it seen immediately so a refresh mid-tour
 * does not replay it. Safe to call on every dashboard mount — it is a no-op once
 * the flag is set. The dashboard is a safe context (no exam-scoped anti-cheat),
 * so this auto-run carries no lockdown risk.
 */
export async function maybeAutoRunDashboardTour(userId: string | null): Promise<void> {
  if (!isBrowser) return;
  if (await hasSeenDashboardTour(userId)) return;
  await markDashboardTourSeen(userId);
  // Defer one frame so the dashboard paints (and its [data-tour] anchors mount)
  // before the overlay appears.
  requestAnimationFrame(() => {
    void runTour("dashboard");
  });
}

/** Replays the dashboard tour on demand (e.g. from the "Panduan" button). */
export function replayDashboardTour(): void {
  void runTour("dashboard");
}

/**
 * Runs the exam-session tour, but ONLY in a safe context. If lockdown
 * enforcement is active it refuses and tells the student to use the panduan
 * before starting — defense in depth on top of the UI hiding the trigger.
 * This is the ONLY path that runs the exam tour; it is never auto-invoked.
 */
export function runExamTourIfSafe(config: AntiCheatConfig): void {
  if (isEnforcementActive(config)) {
    log.warn("Exam tour suppressed: anti-cheat enforcement is active.");
    toast.info("Panduan ujian bisa dibuka dari halaman awal, sebelum ujian dimulai.");
    return;
  }
  void runTour("exam");
}
