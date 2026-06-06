import { test, expect } from "@playwright/test";
import { SetupWizardPage } from "../../pages/SetupWizardPage.ts";

const BACKEND_URL = process.env.E2E_API_URL
  ? new URL(process.env.E2E_API_URL).origin   // "http://localhost:3000"
  : "http://localhost:3000";

test.describe("First-run wizard (#43)", () => {
  test("renders wizard at /#/setup", async ({ page }) => {
    const wizard = new SetupWizardPage(page);
    await wizard.goto();
    await expect(wizard.urlInput).toBeVisible();
    await expect(wizard.testButton).toBeVisible();
    await expect(wizard.testButton).toBeDisabled(); // disabled until URL is filled
  });

  test("Test Koneksi sukses → tampilkan preview sekolah", async ({ page }) => {
    const wizard = new SetupWizardPage(page);
    await wizard.goto();
    await wizard.testConnection(BACKEND_URL);

    // Wait for loading state to finish then preview appears
    await expect(wizard.saveButton).toBeVisible({ timeout: 10_000 });
    await expect(wizard.schoolPreview).toBeVisible();
    // schoolName from /api/info should appear inside the preview card
    await expect(wizard.schoolPreview.getByText("Azhura CBT")).toBeVisible();
  });

  test("Test Koneksi gagal → tampilkan pesan error", async ({ page }) => {
    const wizard = new SetupWizardPage(page);
    await wizard.goto();
    await wizard.testConnection("http://localhost:19999"); // non-existent port

    await expect(wizard.errorMessage).toBeVisible({ timeout: 10_000 });
    // Save button must NOT appear on failure
    await expect(wizard.saveButton).not.toBeVisible();
  });

  test("Simpan & Lanjutkan → redirect ke login", async ({ page }) => {
    const wizard = new SetupWizardPage(page);
    await wizard.goto();
    await wizard.testConnection(BACKEND_URL);

    await expect(wizard.saveButton).toBeVisible({ timeout: 10_000 });
    await wizard.saveButton.click();

    // After saving, wizard navigates to /login
    await expect(page).toHaveURL(/#\/login/, { timeout: 5_000 });
    // Login form should be visible
    await expect(page.locator("#nis")).toBeVisible();
  });

  test("URL kosong → tombol Test Koneksi disabled", async ({ page }) => {
    const wizard = new SetupWizardPage(page);
    await wizard.goto();
    await expect(wizard.testButton).toBeDisabled();

    await wizard.fillUrl("http://localhost:3000");
    await expect(wizard.testButton).toBeEnabled();

    await wizard.fillUrl("");
    await expect(wizard.testButton).toBeDisabled();
  });
});
