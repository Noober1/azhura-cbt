import type { Page } from "@playwright/test";

export class DashboardPage {
  constructor(private readonly page: Page) {}

  heading() {
    return this.page.getByRole("heading", { name: /Selamat datang/i });
  }

  examRow(titlePattern: string | RegExp) {
    const pattern = typeof titlePattern === "string" ? new RegExp(titlePattern, "i") : titlePattern;
    return this.page.getByRole("row", { name: pattern });
  }

  async startExam(titlePattern: string | RegExp) {
    await this.examRow(titlePattern).getByRole("button", { name: "Mulai Ujian" }).click();
  }

  dialog() {
    return this.page.getByRole("alertdialog");
  }

  tokenInput() {
    return this.dialog().locator("#exam-token");
  }

  async confirmStart(token?: string) {
    const d = this.dialog();
    if (token !== undefined) {
      await d.locator("#exam-token").fill(token);
    }
    await d.getByRole("button", { name: "Lanjutkan" }).click();
  }
}
