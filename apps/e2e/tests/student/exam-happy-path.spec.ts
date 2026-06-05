/**
 * Full exam flow: login → start open exam → answer all questions → submit → result.
 * Runs serially because it mutates session state for E2E_STUDENT.
 * globalSetup resets sessions before the suite so re-runs are safe.
 */
import { test, expect } from "../../fixtures/test.ts";
import { E2E_EXAM, E2E_STUDENT } from "../../data/users.ts";

test.describe.configure({ mode: "serial" });

test("login → start exam → answer all → submit → result page", async ({
  page,
  loginPage,
  dashboard,
  examPage,
  resultPage,
}) => {
  // Login
  await loginPage.goto();
  await loginPage.login(E2E_STUDENT.nis, E2E_STUDENT.password);
  await expect(dashboard.heading()).toBeVisible();

  // Start the open exam (no token)
  await dashboard.startExam(E2E_EXAM.title);
  await dashboard.confirmStart();

  // Exam interface loads
  await expect(page).toHaveURL(/#\/exam/);
  await expect(examPage.questionHeading()).toBeVisible();

  // Answer every question and submit
  await examPage.answerAll();
  await examPage.submit();

  // Result page loads with success heading
  await expect(page).toHaveURL(/#\/result/);
  await expect(resultPage.heading()).toBeVisible();
});
