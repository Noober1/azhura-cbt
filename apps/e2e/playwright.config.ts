import { defineConfig, devices } from "@playwright/test";

const STUDENT_URL = process.env.E2E_BASE_URL ?? "http://localhost:1420";
const CONSOLE_URL = process.env.E2E_CONSOLE_URL ?? "http://localhost:1430";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["html", { open: "never" }]],
  globalSetup: "./setup/global-setup.ts",
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "student",
      testDir: "./tests/student",
      use: { ...devices["Desktop Chrome"], baseURL: STUDENT_URL },
    },
    {
      name: "console",
      testDir: "./tests/console",
      use: { ...devices["Desktop Chrome"], baseURL: CONSOLE_URL },
    },
  ],
  // Playwright owns the Vite dev servers. Backend + MySQL + Redis must be started externally.
  webServer: [
    {
      command: "bun --filter azhura-student dev",
      url: STUDENT_URL,
      cwd: "../..",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "bun --filter azhura-console dev",
      url: CONSOLE_URL,
      cwd: "../..",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
