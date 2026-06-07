/**
 * Page object for the Azhura CBT Console — Settings page (/settings).
 * Admin-only; navigating here as a supervisor should redirect to /monitoring.
 */

import type { Page } from "@playwright/test";

export class ConsoleSettingsPage {
  constructor(private readonly page: Page) {}

  goto() {
    return this.page.goto("/#/settings");
  }

  get schoolNameInput() {
    return this.page.getByLabel(/nama sekolah/i);
  }

  get schoolAddressInput() {
    return this.page.getByLabel(/alamat/i);
  }

  get antiCheatCheckbox() {
    return this.page.getByLabel(/aktifkan anti-cheat/i);
  }

  get saveButton() {
    return this.page.getByRole("button", { name: /simpan perubahan/i });
  }

  get cancelButton() {
    return this.page.getByRole("button", { name: /batalkan/i });
  }

  /** The "Pengaturan" nav link in the sidebar rail. */
  get navLink() {
    return this.page.getByRole("link", { name: /pengaturan/i });
  }
}
