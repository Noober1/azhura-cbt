/**
 * E2E: Console — Rekap Nilai page (#19)
 *
 * Covers:
 * - Admin can open /recap via the "Rekap Nilai" nav link.
 * - Per Paket: selecting an exam shows the participant's server-computed score
 *   and class statistics (deterministic seed: E2E Student Two → 67).
 * - Per Siswa: searching a student shows their exam history with score + average.
 * - Supervisor is redirected away from /recap (access denied).
 * - "Rekap Nilai" nav link is hidden from supervisor.
 *
 * Data comes from `seedRecapSession()` (apps/e2e/setup/seed-e2e.ts): a submitted
 * session for E2E Student Two on the open exam, 2 of 3 correct → score 67.
 */

import { test, expect } from "@playwright/test";
import { ConsoleLoginPage } from "../../pages/ConsoleLoginPage";
import { ConsoleRecapPage } from "../../pages/ConsoleRecapPage";
import { E2E_ADMIN, E2E_SUPERVISOR, E2E_RECAP } from "../../data/users";

test.describe("Recap page — admin access", () => {
  test("admin can open recap via nav", async ({ page }) => {
    const login = new ConsoleLoginPage(page);
    const recap = new ConsoleRecapPage(page);

    await login.login(E2E_ADMIN.nis, E2E_ADMIN.password);
    await recap.navLink.click();

    await expect(page).toHaveURL(/\/recap$/);
    await expect(recap.heading).toBeVisible();
    await expect(recap.perPaketTab).toBeVisible();
    await expect(recap.perSiswaTab).toBeVisible();
  });

  test("per-paket shows participant score and class stats", async ({ page }) => {
    const login = new ConsoleLoginPage(page);
    const recap = new ConsoleRecapPage(page);

    await login.login(E2E_ADMIN.nis, E2E_ADMIN.password);
    await expect(page).toHaveURL(/\/(exams|recap|monitoring)/);
    await recap.goto();

    await recap.selectExam(E2E_RECAP.examTitle);

    // The seeded participant appears with the correct server-computed score.
    const row = recap.row(new RegExp(E2E_RECAP.studentName));
    await expect(row).toBeVisible();
    await expect(row.getByText(String(E2E_RECAP.score), { exact: true })).toBeVisible();

    // Class statistics render (single completed participant → avg = its score).
    await expect(page.getByText("Rata-rata")).toBeVisible();
    await expect(page.getByText("Tertinggi")).toBeVisible();
  });

  test("per-siswa shows a student's exam history with score", async ({ page }) => {
    const login = new ConsoleLoginPage(page);
    const recap = new ConsoleRecapPage(page);

    await login.login(E2E_ADMIN.nis, E2E_ADMIN.password);
    await recap.goto();
    await recap.perSiswaTab.click();

    await recap.studentSearch.fill(E2E_RECAP.studentNis);
    // Pick the student from the search results.
    await page.getByRole("button", { name: new RegExp(E2E_RECAP.studentName) }).click();

    // History lists the seeded exam with its score.
    const row = recap.row(new RegExp(E2E_RECAP.examTitle));
    await expect(row).toBeVisible();
    await expect(row.getByText(String(E2E_RECAP.score), { exact: true })).toBeVisible();
    await expect(page.getByText("Rata-rata")).toBeVisible();
  });
});

test.describe("Recap page — supervisor access denied", () => {
  test("supervisor is redirected away from /recap", async ({ page }) => {
    const login = new ConsoleLoginPage(page);

    await login.login(E2E_SUPERVISOR.nis, E2E_SUPERVISOR.password);
    await page.goto("/recap");

    // AdminRoute redirects supervisor to /monitoring.
    await expect(page).toHaveURL(/\/monitoring/);
  });

  test("Rekap Nilai nav link is not visible to supervisor", async ({ page }) => {
    const login = new ConsoleLoginPage(page);
    const recap = new ConsoleRecapPage(page);

    await login.login(E2E_SUPERVISOR.nis, E2E_SUPERVISOR.password);
    await expect(recap.navLink).not.toBeVisible();
  });
});
