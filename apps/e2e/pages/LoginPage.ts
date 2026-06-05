import type { Page } from "@playwright/test";

export class LoginPage {
  private readonly form;

  constructor(private readonly page: Page) {
    this.form = page.locator("form").filter({ has: page.locator("#nis") });
  }

  goto() {
    return this.page.goto("/#/login");
  }

  get nis() {
    return this.page.locator("#nis");
  }

  get password() {
    return this.page.locator("#password");
  }

  get submitButton() {
    return this.form.getByRole("button", { name: "Mulai Ujian" });
  }

  async login(nis: string, password: string) {
    await this.nis.fill(nis);
    await this.password.fill(password);
    await this.submitButton.click();
  }

  errorBanner() {
    return this.page.getByText(/NIS atau Password salah|tidak aktif|gagal/i);
  }
}
