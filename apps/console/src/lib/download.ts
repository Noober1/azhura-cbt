/**
 * Azhura CBT Console — file download helpers.
 *
 * Triggers a browser "Save As" for a Blob fetched via the authenticated axios
 * instance (so downloads stay JWT-gated, no token-in-URL), and extracts the
 * server-provided filename from a `Content-Disposition` header.
 */

/** Triggers a browser download of `blob` named `filename`. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Pulls `filename="…"` out of a `Content-Disposition` header value.
 * @returns the filename, or `fallback` when none is present.
 */
export function filenameFromContentDisposition(
  header: string | undefined,
  fallback: string
): string {
  if (!header) return fallback;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match ? decodeURIComponent(match[1]) : fallback;
}
