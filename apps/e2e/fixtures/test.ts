import { test as base, expect, type Page } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage.ts";
import { DashboardPage } from "../pages/DashboardPage.ts";
import { ExamPage } from "../pages/ExamPage.ts";
import { ResultPage } from "../pages/ResultPage.ts";
import { apiLogin } from "./api.ts";
import { E2E_STUDENT } from "../data/users.ts";
import { clearE2ERedisClaimsForE2EUsers } from "../setup/redis-utils.ts";

interface E2EFixtures {
  loginPage: LoginPage;
  dashboard: DashboardPage;
  examPage: ExamPage;
  resultPage: ResultPage;
  /** Page pre-authenticated as E2E_STUDENT, already navigated to /#/dashboard. */
  authedPage: Page;
  /** Auto-runs after every test: clears Redis session claims so the next test can log in. */
  _redisCleanup: void;
}

export const test = base.extend<E2EFixtures>({
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  dashboard: async ({ page }, use) => use(new DashboardPage(page)),
  examPage: async ({ page }, use) => use(new ExamPage(page)),
  resultPage: async ({ page }, use) => use(new ResultPage(page)),

  authedPage: async ({ page }, use) => {
    const { token, user } = await apiLogin(E2E_STUDENT.nis, E2E_STUDENT.password);

    // Inject localStorage keys that Zustand's auth store reads at bootstrap
    await page.addInitScript(
      ({ t, u }: { t: string; u: string }) => {
        localStorage.setItem("cbt_token", t);
        localStorage.setItem("cbt_user_id", (JSON.parse(u) as { id: string }).id);
        localStorage.setItem("cbt_user", u);
      },
      { t: token, u: JSON.stringify(user) }
    );

    await page.goto("/#/dashboard");
    await use(page);
  },

  // Runs automatically after every test in files that import this custom `test`.
  // Clears the Redis session-claim keys so the anti-multi-login guard (30s TTL)
  // doesn't block the next test's login.
  _redisCleanup: [
    async ({}, use) => {
      await use();
      await clearE2ERedisClaimsForE2EUsers();
    },
    { auto: true },
  ],
});

export { expect };
