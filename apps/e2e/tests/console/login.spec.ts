/**
 * Console smoke test — verifies the admin/supervisor web app boots on :1430.
 * Expand this when the admin login surface lands (epic #6).
 */
import { test, expect } from "@playwright/test";

test("console app renders on :1430", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  // The app must not crash on load (no unhandled runtime errors in 2s)
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(2_000);
  expect(errors, `Console crashed: ${errors.join(", ")}`).toHaveLength(0);
});
