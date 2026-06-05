import { test, expect } from "../../fixtures/test.ts";
import { E2E_STUDENT } from "../../data/users.ts";

test.describe("Student login", () => {
  test("valid credentials → navigates to dashboard", async ({ page, loginPage, dashboard }) => {
    await loginPage.goto();
    await loginPage.login(E2E_STUDENT.nis, E2E_STUDENT.password);
    await expect(dashboard.heading()).toBeVisible();
    await expect(page).toHaveURL(/#\/dashboard/);
  });

  test("wrong password → shows error", async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login(E2E_STUDENT.nis, "wrong-password");
    await expect(loginPage.errorBanner()).toBeVisible();
  });

  test("unknown NIS → shows error", async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login("000000", "student@123");
    await expect(loginPage.errorBanner()).toBeVisible();
  });
});
