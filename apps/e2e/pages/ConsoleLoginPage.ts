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

  // Label-based locators: the console login inputs get auto-generated ids from
  // the shared <Field> component (useId()), so id selectors like "#nis" don't
  // exist (#63). The labels are stable: "NIS / Username" and "Password".
  get nis() {
    return this.page.getByLabel(/NIS/i);
  }

  get password() {
    return this.page.getByLabel(/Password/i);
  }

  get submitButton() {
    return this.page.getByRole("button", { name: /masuk|login/i });
  }

  async login(nis: string, password: string) {
    await this.goto();
    await this.nis.fill(nis);
    await this.password.fill(password);
    await this.submitButton.click();
    // Wait for the post-login redirect to settle so callers act on an
    // authenticated app — otherwise an immediate navigation races auth
    // hydration and AdminRoute bounces back to /login (#63).
    await this.page.waitForURL((url) => !url.pathname.endsWith("/login"), {
      timeout: 15_000,
    });
  }
}
