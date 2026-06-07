/**
 * E2E: Console — System Settings page (#16)
 *
 * Covers:
 * - Admin can navigate to /settings and see the form.
 * - Admin can edit school name and save; value persists after reload.
 * - "Batalkan" resets unsaved changes.
 * - Supervisor is redirected away from /settings (access denied).
 * - "Pengaturan" nav link is hidden from supervisor.
 */

import { test, expect } from "@playwright/test";
import { ConsoleLoginPage } from "../../pages/ConsoleLoginPage";
import { ConsoleSettingsPage } from "../../pages/ConsoleSettingsPage";
import { E2E_ADMIN, E2E_SUPERVISOR } from "../../data/users";

const UNIQUE_NAME = `E2E Sekolah ${Date.now()}`;

test.describe("Settings page — admin access", () => {
  test("admin can open settings via nav", async ({ page }) => {
    const login = new ConsoleLoginPage(page);
    const settings = new ConsoleSettingsPage(page);

    await login.login(E2E_ADMIN.nis, E2E_ADMIN.password);
    await settings.navLink.click();

    await expect(page).toHaveURL(/#\/settings/);
    await expect(settings.schoolNameInput).toBeVisible();
    await expect(settings.saveButton).toBeVisible();
  });

  test("admin can edit school name and persist after reload", async ({ page }) => {
    const login = new ConsoleLoginPage(page);
    const settings = new ConsoleSettingsPage(page);

    await login.login(E2E_ADMIN.nis, E2E_ADMIN.password);
    // Wait for post-login redirect to complete before navigating to settings.
    await expect(page).toHaveURL(/#\/(exams|settings|monitoring)/);
    await settings.goto();

    await settings.schoolNameInput.fill(UNIQUE_NAME);
    await expect(settings.saveButton).toBeEnabled();
    await settings.saveButton.click();

    // Toast confirms save, then button returns to disabled (no more changes).
    await expect(page.getByText(/berhasil disimpan/i)).toBeVisible();
    await expect(settings.saveButton).toBeDisabled();

    // Reload to confirm the value persisted via the backend.
    await page.reload();
    await expect(settings.schoolNameInput).toHaveValue(UNIQUE_NAME);
  });

  test("cancel reverts unsaved changes", async ({ page }) => {
    const login = new ConsoleLoginPage(page);
    const settings = new ConsoleSettingsPage(page);

    await login.login(E2E_ADMIN.nis, E2E_ADMIN.password);
    await settings.goto();

    const originalValue = await settings.schoolNameInput.inputValue();
    await settings.schoolNameInput.fill("Perubahan Sementara");
    await expect(settings.saveButton).toBeEnabled();

    await settings.cancelButton.click();
    await expect(settings.schoolNameInput).toHaveValue(originalValue);
    await expect(settings.saveButton).toBeDisabled();
  });

  test("save button is disabled when no changes are made", async ({ page }) => {
    const login = new ConsoleLoginPage(page);
    const settings = new ConsoleSettingsPage(page);

    await login.login(E2E_ADMIN.nis, E2E_ADMIN.password);
    await settings.goto();

    await expect(settings.saveButton).toBeDisabled();
  });
});

test.describe("Settings page — supervisor access denied", () => {
  test("supervisor is redirected away from /settings", async ({ page }) => {
    const login = new ConsoleLoginPage(page);

    await login.login(E2E_SUPERVISOR.nis, E2E_SUPERVISOR.password);
    await page.goto("/#/settings");

    // AdminRoute redirects supervisor to /monitoring
    await expect(page).toHaveURL(/#\/monitoring/);
  });

  test("Pengaturan nav link is not visible to supervisor", async ({ page }) => {
    const login = new ConsoleLoginPage(page);
    const settings = new ConsoleSettingsPage(page);

    await login.login(E2E_SUPERVISOR.nis, E2E_SUPERVISOR.password);
    await expect(settings.navLink).not.toBeVisible();
  });
});
