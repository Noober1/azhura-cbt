/**
 * Azhura CBT Console — Groups spreadsheet import API client (#72).
 *
 * Two-phase import: `dryRun` parses + validates and returns a preview;
 * `confirm` executes the upsert using the preview session token.
 */

import api from "./api";
import { filenameFromContentDisposition, saveBlob } from "./download";
import type { GroupImportPreview, GroupImportConfirmResult } from "../types";

export const groupsImportApi = {
  /** Download an empty template file. */
  async downloadTemplate(format: "xlsx" | "csv"): Promise<void> {
    const res = await api.get<Blob>(`/admin/groups/template`, {
      params: { format },
      responseType: "blob",
    });
    const filename = filenameFromContentDisposition(
      res.headers["content-disposition"],
      `template-grup.${format}`
    );
    saveBlob(res.data, filename);
  },

  /** Parse and validate the file server-side; returns a preview with sessionId. */
  async dryRun(file: File): Promise<GroupImportPreview> {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post<GroupImportPreview>("/admin/groups/import", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  /** Execute the upsert for the given session. */
  async confirm(sessionId: string): Promise<GroupImportConfirmResult> {
    const { data } = await api.post<GroupImportConfirmResult>(
      "/admin/groups/import/confirm",
      { sessionId }
    );
    return data;
  },
};
