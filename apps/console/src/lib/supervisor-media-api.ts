/**
 * Azhura CBT Console — Supervisor media API client (#88).
 *
 * Mirrors `media-api.ts` but calls `/supervisor/media` endpoints so supervisors
 * can browse and upload to the shared library without the admin-only restriction.
 * Upload and list are allowed; delete is admin-only and not exposed here.
 */

import api from "./api";
import type { MediaFile, MediaListResponse } from "../types";
import type { MediaListParams } from "./media-api";

export const supervisorMediaApi = {
  async list(
    params: MediaListParams = {},
    signal?: AbortSignal
  ): Promise<MediaListResponse> {
    const { data } = await api.get<MediaListResponse>("/supervisor/media", {
      params,
      signal,
    });
    return data;
  },

  async upload(
    file: File,
    onProgress?: (pct: number) => void
  ): Promise<MediaFile> {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post<MediaFile>("/supervisor/media", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (evt) => {
        if (onProgress && evt.total) {
          onProgress(Math.round((evt.loaded * 100) / evt.total));
        }
      },
    });
    return data;
  },
};
