import type { Page } from "@playwright/test";

export class ExamPage {
  constructor(private readonly page: Page) {}

  questionHeading() {
    return this.page.getByText(/Nomor \d+ dari \d+/);
  }

  radioOptions() {
    return this.page.getByRole("radio");
  }

  nextButton() {
    return this.page.getByRole("button", { name: "Berikutnya" });
  }

  submitTriggerButton() {
    return this.page.getByRole("button", { name: "Kumpulkan Ujian" });
  }

  submitDialog() {
    return this.page.getByRole("alertdialog");
  }

  submitConfirmButton() {
    return this.submitDialog().getByRole("button", { name: "Ya, Kumpulkan" });
  }

  /** Select the first option on every question and click Next until submit is visible. */
  async answerAll() {
    while (!(await this.submitTriggerButton().isVisible())) {
      await this.radioOptions().first().click();
      await this.nextButton().click();
    }
    // Answer the last question
    await this.radioOptions().first().click();
  }

  async submit() {
    await this.submitTriggerButton().click();
    await this.submitConfirmButton().click();
  }
}
