/**
 * Token-gated exam: wrong token keeps the dialog open; correct token starts the exam.
 * Uses E2E_STUDENT_ALT to avoid session conflicts with exam-happy-path.
 * Runs serially (each test mutates E2E_STUDENT_ALT's session state).
 * globalSetup resets sessions before the suite so re-runs are safe.
 */
import { test, expect } from "@playwright/test";
import { DashboardPage } from "../../pages/DashboardPage.ts";
import { ExamPage } from "../../pages/ExamPage.ts";
import { apiLogin } from "../../fixtures/api.ts";
import { E2E_EXAM_TOKEN, E2E_STUDENT_ALT } from "../../data/users.ts";
import type { Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

/** Authenticates E2E_STUDENT_ALT by injecting localStorage keys. */
async function authAltStudent(page: Page): Promise<void> {
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

test.describe("Token-gated exam", () => {
  test("wrong token → dialog stays open", async ({ page }) => {
    await authAltStudent(page);
    await page.goto("/#/dashboard");

    const dashboard = new DashboardPage(page);
    await expect(dashboard.heading()).toBeVisible();
    await dashboard.startExam(E2E_EXAM_TOKEN.title);

    // Enter a wrong token (valid format, wrong value)
    await dashboard.confirmStart("ZZZZ");

    // Dialog must remain open — backend rejects the wrong token
    await expect(dashboard.dialog()).toBeVisible({ timeout: 5_000 });
    await expect(page).not.toHaveURL(/#\/exam/);
  });

  test("correct token → navigates to exam", async ({ page }) => {
    await authAltStudent(page);
    await page.goto("/#/dashboard");

    const dashboard = new DashboardPage(page);
    await expect(dashboard.heading()).toBeVisible();
    await dashboard.startExam(E2E_EXAM_TOKEN.title);
    await dashboard.confirmStart(E2E_EXAM_TOKEN.token);

    const exam = new ExamPage(page);
    await expect(page).toHaveURL(/#\/exam/);
    await expect(exam.questionHeading()).toBeVisible();
  });
});
