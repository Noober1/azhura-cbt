/**
 * E2E: Console — Rekap Nilai page (#19), UI-only.
 *
 * Covers the UI surface (not backend scoring — that's unit-tested in
 * backend/src/lib/recap.test.ts):
 * - Admin can open /recap via the "Rekap Nilai" nav link; both tabs render.
 * - Per Paket: selecting an exam loads the recap and renders the stat cards.
 * - Per Siswa: searching a student and selecting one renders their recap view.
 * - Supervisor is redirected away from /recap (access denied).
 * - "Rekap Nilai" nav link is hidden from supervisor.
 *
 * Uses only the base seed (E2E_EXAM, E2E_STUDENT); assertions target UI
 * structure/labels, not specific scores, so they stay deterministic regardless
 * of how much exam data other specs produced.
 */

import { test, expect } from "@playwright/test";
import { ConsoleLoginPage } from "../../pages/ConsoleLoginPage";
import { ConsoleRecapPage } from "../../pages/ConsoleRecapPage";
import { E2E_ADMIN, E2E_SUPERVISOR, E2E_EXAM, E2E_STUDENT } from "../../data/users";

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

  test("per-paket: selecting an exam renders the stat cards", async ({ page }) => {
    const login = new ConsoleLoginPage(page);
    const recap = new ConsoleRecapPage(page);

    await login.login(E2E_ADMIN.nis, E2E_ADMIN.password);
    await expect(page).toHaveURL(/\/(exams|recap|monitoring)/);
    await recap.goto();

    // Before selecting an exam, the empty prompt is shown.
    await expect(page.getByText(/pilih paket ujian/i)).toBeVisible();

    await recap.selectExam(E2E_EXAM.title);

    // After load, the class-statistics cards always render (values may be "—").
    // "Tertinggi"/"Terendah" are unique to the stat row (unlike "Selesai", which
    // also appears as a participant status badge), so they're unambiguous.
    await expect(page.getByText("Rata-rata")).toBeVisible();
    await expect(page.getByText("Tertinggi")).toBeVisible();
    await expect(page.getByText("Terendah")).toBeVisible();
  });

  test("per-siswa: searching and selecting a student renders their recap", async ({ page }) => {
    const login = new ConsoleLoginPage(page);
    const recap = new ConsoleRecapPage(page);

    await login.login(E2E_ADMIN.nis, E2E_ADMIN.password);
    await recap.goto();
    await recap.perSiswaTab.click();

    await expect(recap.studentSearch).toBeVisible();
    await recap.studentSearch.fill(E2E_STUDENT.nis);

    // Pick the matching student from the results list.
    await page.getByRole("button", { name: new RegExp(E2E_STUDENT.name) }).click();

    // The selected-student recap view renders: a "Ganti siswa" control and the
    // summary stat cards.
    await expect(page.getByRole("button", { name: /ganti siswa/i })).toBeVisible();
    await expect(page.getByText("Ujian diikuti")).toBeVisible();
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
