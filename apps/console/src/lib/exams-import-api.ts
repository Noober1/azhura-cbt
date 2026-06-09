/**
 * Azhura CBT Console — Exam spreadsheet import API client (#82).
 *
 * Two-phase import: `dryRun` parses + validates and returns a preview;
 * `confirm` executes bulk insert using the session token.
 */

import api from "./api";
import { filenameFromContentDisposition, saveBlob } from "./download";
import type { ExamImportPreview, ExamImportConfirmResult } from "../types";

export const examsImportApi = {
  /** Download an empty template file. */
  async downloadTemplate(format: "xlsx" | "csv"): Promise<void> {
    const res = await api.get<Blob>(`/admin/exams/template`, {
      params: { format },
      responseType: "blob",
    });
    const filename = filenameFromContentDisposition(
      res.headers["content-disposition"],
      `template-ujian.${format}`
    );
    saveBlob(res.data, filename);
  },

  /** Parse and validate the file server-side; returns a preview with sessionToken. */
  async dryRun(file: File): Promise<ExamImportPreview> {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post<ExamImportPreview>("/admin/exams/import", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  /** Execute the bulk insert for the given session. */
  async confirm(sessionToken: string): Promise<ExamImportConfirmResult> {
    const { data } = await api.post<ExamImportConfirmResult>(
      "/admin/exams/import/confirm",
      { sessionToken }
    );
    return data;
  },
};
