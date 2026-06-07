/**
 * Page object for the Azhura CBT Console — Rekap Nilai page (/recap, #19).
 * Admin-only; navigating here as a supervisor should redirect to /monitoring.
 */

import type { Page } from "@playwright/test";

export class ConsoleRecapPage {
  constructor(private readonly page: Page) {}

  goto() {
    // Console uses BrowserRouter (path-based), not hash routing (#63).
    return this.page.goto("/recap");
  }

  /** The "Rekap Nilai" nav link in the sidebar rail. */
  get navLink() {
    return this.page.getByRole("link", { name: /rekap nilai/i });
  }

  get heading() {
    return this.page.getByRole("heading", { name: /rekap nilai/i });
  }

  get perPaketTab() {
    return this.page.getByRole("button", { name: "Per Paket" });
  }

  get perSiswaTab() {
    return this.page.getByRole("button", { name: "Per Siswa" });
  }

  /** Per Paket: the exam picker (wrapping <label> associates "Paket ujian"). */
  get examSelect() {
    return this.page.getByLabel("Paket ujian");
  }

  /** Per Siswa: the student search box. */
  get studentSearch() {
    return this.page.getByLabel(/cari siswa/i);
  }

  /** Selects an exam in the Per Paket picker by its visible title. */
  selectExam(title: string) {
    return this.examSelect.selectOption({ label: title });
  }
}
