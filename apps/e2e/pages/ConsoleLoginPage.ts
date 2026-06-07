/**
 * Page object for the Azhura CBT Console login screen (apps/console).
 * Mirrors the student LoginPage structure but targets the console app on :1430.
 */

import type { Page } from "@playwright/test";

export class ConsoleLoginPage {
  constructor(private readonly page: Page) {}

  goto() {
    return this.page.goto("/");
  }

  get nis() {
    return this.page.locator("#nis");
  }

  get password() {
    return this.page.locator("#password");
  }

  get submitButton() {
    return this.page.getByRole("button", { name: /masuk|login/i });
  }

  async login(nis: string, password: string) {
    await this.goto();
    await this.nis.fill(nis);
    await this.password.fill(password);
    await this.submitButton.click();
  }
}
