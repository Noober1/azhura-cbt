/**
 * Azhura CBT App — Media URL resolution (#163).
 *
 * Backend media (question/option images) is stored as a relative
 * `/uploads/...` path so records stay valid across deployments. The exam
 * client may run from a different origin than the API (Tauri desktop, or a
 * dev server on another port), so relative paths must be resolved against
 * the backend origin before rendering.
 */

import { useConfigStore } from "../stores/config";

/**
 * Resolves a backend media path (e.g. `/uploads/images/uuid.jpg`) to an
 * absolute URL rooted at the configured server origin.
 *
 * Origin precedence mirrors `lib/api.ts`: the runtime `serverUrl` from the
 * config store (first-run wizard #43 / hidden settings #42) wins; when unset
 * the path is returned as-is, falling back to same-origin serving (web build
 * behind a reverse proxy). Absolute `http(s)` URLs pass through untouched.
 */
export function resolveMediaUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const { serverUrl } = useConfigStore.getState();
  if (!serverUrl) return url;
  return `${serverUrl.replace(/\/$/, "")}${url}`;
}
