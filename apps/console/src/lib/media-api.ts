/**
 * Azhura CBT Console — Media Library API client (#84/#87).
 *
 * Thin typed wrappers over `/admin/media`. Upload uses `FormData` + axios
 * `onUploadProgress` so callers can render a progress bar.
 */

import api from "./api";
import type { MediaFile, MediaListResponse } from "../types";

export interface MediaListParams {
  type?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export const mediaApi = {
  async list(params: MediaListParams = {}, signal?: AbortSignal): Promise<MediaListResponse> {
    const { data } = await api.get<MediaListResponse>("/admin/media", { params, signal });
    return data;
  },

  async upload(file: File, onProgress?: (pct: number) => void): Promise<MediaFile> {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post<MediaFile>("/admin/media", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (evt) => {
        if (onProgress && evt.total) {
          onProgress(Math.round((evt.loaded * 100) / evt.total));
        }
      },
    });
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/admin/media/${id}`);
  },
};
