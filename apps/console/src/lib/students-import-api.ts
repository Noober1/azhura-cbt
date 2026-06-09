/**
 * Azhura CBT Console — Students spreadsheet import API client (#70).
 *
 * Two-phase import: `dryRun` parses + validates and returns a preview;
 * `confirm` executes upsert (and optional sync deletes) using the session token.
 */

import api from "./api";
import { filenameFromContentDisposition, saveBlob } from "./download";
import type { StudentImportPreview, StudentImportConfirmResult } from "../types";

export const studentsImportApi = {
  /** Download an empty template file. */
  async downloadTemplate(format: "xlsx" | "csv"): Promise<void> {
    const res = await api.get<Blob>(`/admin/students/template`, {
      params: { format },
      responseType: "blob",
    });
    const filename = filenameFromContentDisposition(
      res.headers["content-disposition"],
      `template-siswa.${format}`
    );
    saveBlob(res.data, filename);
  },

  /** Parse and validate the file server-side; returns a preview with sessionId. */
  async dryRun(file: File, mode: "import" | "sync"): Promise<StudentImportPreview> {
    const form = new FormData();
    form.append("file", file);
    form.append("mode", mode);
    const { data } = await api.post<StudentImportPreview>("/admin/students/import", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  /** Execute the upsert (and optional sync deletes) for the given session. */
  async confirm(sessionId: string): Promise<StudentImportConfirmResult> {
    const { data } = await api.post<StudentImportConfirmResult>(
      "/admin/students/import/confirm",
      { sessionId }
    );
    return data;
  },
};
