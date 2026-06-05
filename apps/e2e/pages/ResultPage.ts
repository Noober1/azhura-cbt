import type { Page } from "@playwright/test";

export class ResultPage {
  constructor(private readonly page: Page) {}

  heading() {
    return this.page.getByRole("heading", { name: "Hasil Ujian Selesai" });
  }

  backButton() {
    return this.page.getByRole("button", { name: "Kembali ke Dashboard" });
  }
}
