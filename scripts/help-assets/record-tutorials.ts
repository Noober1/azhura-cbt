/**
 * Azhura CBT — Help tutorial recorder (#180).
 *
 * Records short console walkthrough clips with Playwright, one video per
 * tutorial step, into `scripts/help-assets/recordings/<topic>/<step>.webm`.
 * Convert them afterwards with `convert.sh` (ffmpeg → animated WebP + poster)
 * and the results land in `apps/console/src/assets/help/`.
 *
 * Prerequisites (see README.md in this folder):
 *  - backend running with a seeded MariaDB (`cd apps/e2e && bun run seed`)
 *  - console dev server running (`bun run console:dev`, port 1430)
 *  - chromium installed (`cd apps/e2e && bun run install:browsers`)
 *
 * Run from the repo root:
 *    bun scripts/help-assets/record-tutorials.ts            # all journeys
 *    bun scripts/help-assets/record-tutorials.ts groups     # one topic only
 *
 * Each step records in its own browser context (that is what gives us one
 * video per step), reusing a logged-in storage state so the clip starts
 * straight at the relevant screen. Keep every step's actions short — the
 * converter caps the animation at 10 seconds.
 */

import { mkdir, rm, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

// @playwright/test is a dependency of the apps/e2e workspace (not hoisted to
// the repo root), so resolve it from there — this script can then live in
// scripts/ and run from the repo root without extra root dependencies.
const requireFromE2E = createRequire(new URL("../../apps/e2e/package.json", import.meta.url));
const { chromium } = requireFromE2E("@playwright/test") as typeof import("@playwright/test");
type Browser = import("@playwright/test").Browser;
type Page = import("@playwright/test").Page;

const CONSOLE_URL = process.env.TUTORIAL_CONSOLE_URL ?? "http://localhost:1430";
// Defaults match the seeded e2e admin (apps/e2e/data/users.ts).
const ADMIN_NIS = process.env.TUTORIAL_ADMIN_NIS ?? "900001";
const ADMIN_PASSWORD = process.env.TUTORIAL_ADMIN_PASSWORD ?? "admin@123";

const OUT_DIR = join(import.meta.dir, "recordings");
const VIEWPORT = { width: 1280, height: 800 };
/** Small pause so each action stays readable in the final animation. */
const BEAT_MS = 700;

interface StepRecording {
  /** HelpTopic key — becomes the folder name under assets/help/. */
  topic: string;
  /** 1-based step number — becomes the file name (<step>.webm). */
  step: number;
  /** What the clip demonstrates; keep in sync with help-content.ts. */
  note: string;
  run: (page: Page) => Promise<void>;
}

const beat = (page: Page) => page.waitForTimeout(BEAT_MS);

/**
 * The recording plan. Extend this list as more topics get tutorials; the
 * locators mirror the console UI copy, so adjust them if labels change.
 */
const RECORDINGS: StepRecording[] = [
  {
    topic: "groups",
    step: 1,
    note: "Buka halaman Grup dari menu samping.",
    run: async (page) => {
      await page.goto(CONSOLE_URL);
      await beat(page);
      await page.getByRole("link", { name: /grup/i }).first().click();
      await page.waitForURL(/groups/);
      await beat(page);
    },
  },
  {
    topic: "groups",
    step: 2,
    note: "Klik tombol \"Buat grup\" untuk membuka formulir.",
    run: async (page) => {
      await page.goto(`${CONSOLE_URL}/groups`);
      await beat(page);
      await page.getByRole("button", { name: /buat grup/i }).click();
      await page.getByRole("dialog").waitFor();
      await beat(page);
    },
  },
  {
    topic: "groups",
    step: 3,
    note: "Isi nama dan kode grup, lalu simpan.",
    run: async (page) => {
      await page.goto(`${CONSOLE_URL}/groups`);
      await page.getByRole("button", { name: /buat grup/i }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel(/nama/i).fill("Kelas 7A");
      await beat(page);
      await dialog.getByLabel(/kode/i).fill("7A");
      await beat(page);
      await dialog.getByRole("button", { name: /simpan|buat/i }).click();
      await beat(page);
    },
  },
];

/** Logs in once and returns the storage state all step contexts reuse. */
async function loginStorageState(browser: Browser): Promise<string> {
  const statePath = join(OUT_DIR, ".auth-state.json");
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await page.goto(`${CONSOLE_URL}/login`);
  await page.getByLabel(/NIS/i).fill(ADMIN_NIS);
  await page.getByLabel(/Password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /masuk|login/i }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 15_000 });
  await context.storageState({ path: statePath });
  await context.close();
  return statePath;
}

async function recordStep(browser: Browser, statePath: string, rec: StepRecording): Promise<void> {
  const topicDir = join(OUT_DIR, rec.topic);
  await mkdir(topicDir, { recursive: true });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    storageState: statePath,
    recordVideo: { dir: topicDir, size: VIEWPORT },
  });
  const page = await context.newPage();
  await rec.run(page);

  const video = page.video();
  await context.close(); // finalises the video file
  if (!video) throw new Error(`No video captured for ${rec.topic}/${rec.step}`);
  const rawPath = await video.path();
  await copyFile(rawPath, join(topicDir, `${rec.step}.webm`));
  await rm(rawPath);
  process.stdout.write(`recorded ${rec.topic}/${rec.step}.webm — ${rec.note}\n`);
}

async function main(): Promise<void> {
  const onlyTopic = process.argv[2];
  const plan = onlyTopic ? RECORDINGS.filter((r) => r.topic === onlyTopic) : RECORDINGS;
  if (plan.length === 0) {
    throw new Error(
      `No recordings planned for topic "${onlyTopic}". Known topics: ${[...new Set(RECORDINGS.map((r) => r.topic))].join(", ")}`,
    );
  }

  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const statePath = await loginStorageState(browser);
    for (const rec of plan) {
      await recordStep(browser, statePath, rec);
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(`done — now run scripts/help-assets/convert.sh\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
