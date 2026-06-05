/**
 * Session resume: when a student has an in-progress session, the dashboard's
 * resume guard fires and auto-redirects them to /#/exam.
 *
 * Logs in once via API to get a JWT, uses it to create the session AND inject
 * into localStorage — avoids a second login that would hit the anti-multi-login
 * guard (PENDING_TTL = 30s Redis claim).
 */
import { test, expect } from "../../fixtures/test.ts";
import { ExamPage } from "../../pages/ExamPage.ts";
import { apiLogin, apiStartSessionWithToken } from "../../fixtures/api.ts";
import { E2E_EXAM, E2E_STUDENT_ALT } from "../../data/users.ts";

test.describe("Session resume", () => {
  test("in-progress session → dashboard auto-redirects to /exam", async ({ page }) => {
    // Single login — reuse the JWT for both session creation and localStorage injection
    const { token, user } = await apiLogin(E2E_STUDENT_ALT.nis, E2E_STUDENT_ALT.password);

    await apiStartSessionWithToken(E2E_EXAM.id, token);

    await page.addInitScript(
      ({ t, u }: { t: string; u: string }) => {
        localStorage.setItem("cbt_token", t);
        localStorage.setItem("cbt_user_id", (JSON.parse(u) as { id: string }).id);
        localStorage.setItem("cbt_user", u);
      },
      { t: token, u: JSON.stringify(user) }
    );

    await page.goto("/#/dashboard");

    // Resume guard fires and redirects before the dashboard even renders fully
    await expect(page).toHaveURL(/#\/exam/, { timeout: 10_000 });
    const exam = new ExamPage(page);
    await expect(exam.questionHeading()).toBeVisible();
  });
});
