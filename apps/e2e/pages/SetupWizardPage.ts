import type { Page } from "@playwright/test";

export class SetupWizardPage {
  constructor(private readonly page: Page) {}

  goto() {
    return this.page.goto("/#/setup");
  }

  get urlInput() {
    return this.page.locator("#server-url");
  }

  get testButton() {
    return this.page.getByRole("button", { name: /test koneksi/i });
  }

  get saveButton() {
    return this.page.getByRole("button", { name: /simpan.*lanjutkan/i });
  }

  /** Preview card shown after a successful connection test. */
  get schoolPreview() {
    return this.page.locator(".rounded-md.border");
  }

  get errorMessage() {
    return this.page.locator(".text-destructive");
  }

  async fillUrl(url: string) {
    await this.urlInput.fill(url);
  }

  async testConnection(url: string) {
    await this.fillUrl(url);
    await this.testButton.click();
  }
}
