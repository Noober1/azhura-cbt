import type { Page } from "@playwright/test";

export class ResultPage {
  constructor(private readonly page: Page) {}

  heading() {
    // CardTitle renders as <div>, not <h*>, so use text instead of role heading
    return this.page.getByText("Hasil Ujian Selesai", { exact: true });
  }

  backButton() {
    return this.page.getByRole("button", { name: "Kembali ke Dashboard" });
  }
}
