/**
 * Session resume: when a student has an in-progress session, the dashboard's
 * resume guard fires and auto-redirects them to /#/exam.
 *
 * Uses a fresh API-created session for E2E_STUDENT_ALT on the open exam.
 * This test must run after exam-token-gate so E2E_STUDENT_ALT's session is
 * already created (correct token test). We create it here via API just in case.
 */
import { test, expect } from "../../fixtures/test.ts";
import { ExamPage } from "../../pages/ExamPage.ts";
import { apiLogin, apiStartSession } from "../../fixtures/api.ts";
import { E2E_EXAM, E2E_STUDENT_ALT } from "../../data/users.ts";
import type { Page } from "@playwright/test";

async function authAndInjectAlt(page: Page): Promise<void> {
  const { token, user } = await apiLogin(E2E_STUDENT_ALT.nis, E2E_STUDENT_ALT.password);
  await page.addInitScript(
    ({ t, u }: { t: string; u: string }) => {
      localStorage.setItem("cbt_token", t);
      localStorage.setItem("cbt_user_id", (JSON.parse(u) as { id: string }).id);
      localStorage.setItem("cbt_user", u);
    },
    { t: token, u: JSON.stringify(user) }
  );
}

test.describe("Session resume", () => {
  test("in-progress session → dashboard auto-redirects to /exam", async ({ page }) => {
    // Create an active session for E2E_STUDENT_ALT on the open exam
    await apiStartSession(E2E_STUDENT_ALT, E2E_EXAM.id);

    await authAndInjectAlt(page);
    await page.goto("/#/dashboard");

    // Resume guard fires and redirects before the dashboard even renders fully
    await expect(page).toHaveURL(/#\/exam/, { timeout: 10_000 });
    const exam = new ExamPage(page);
    await expect(exam.questionHeading()).toBeVisible();
  });
});
