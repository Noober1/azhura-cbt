/**
 * Azhura CBT Console — formatting helpers (date/time/duration).
 *
 * The admin API returns timestamps as epoch-millis numbers; these convert to and
 * from the formats the UI needs (display strings, `datetime-local` inputs).
 */

const DATE_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Epoch-millis → "12 Jun 2026, 14.30" (Indonesian locale). */
export function formatDateTime(epochMs: number): string {
  return DATE_FMT.format(new Date(epochMs));
}

/** Minutes → "1j 30m" / "45m". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}j` : `${h}j ${m}m`;
}

/**
 * Epoch-millis → value for an `<input type="datetime-local">` (local time,
 * `YYYY-MM-DDTHH:mm`). Returns "" for non-finite input.
 */
export function toDatetimeLocal(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return "";
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** `datetime-local` string → epoch-millis (NaN if empty/invalid). */
export function fromDatetimeLocal(value: string): number {
  if (!value) return NaN;
  return new Date(value).getTime();
}

/** @returns `true` if the epoch-millis instant is in the past. */
export function isPast(epochMs: number): boolean {
  return epochMs <= Date.now();
}

/** Byte count → human-readable string: "4.2 MB", "320 KB", "512 B". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The backend origin derived from `VITE_API_BASE_URL` (the `/api` suffix
 * stripped). Empty string when same-origin (web build behind a reverse proxy).
 */
function backendOrigin(): string {
  return (import.meta.env.VITE_API_BASE_URL as string || "/api").replace(/\/api\/?$/, "");
}

/**
 * Resolves a media URL returned by the backend (e.g. `/uploads/images/uuid.jpg`)
 * to an absolute URL rooted at the backend origin.
 *
 * The console runs on a different port than the backend, so relative paths must
 * be prefixed with the backend origin derived from `VITE_API_BASE_URL`.
 */
export function resolveMediaUrl(url: string): string {
  if (url.startsWith("http")) return url;
  return `${backendOrigin()}${url}`;
}

/**
 * Inverse of {@link resolveMediaUrl}: collapses an absolute media URL that
 * points at OUR OWN backend origin back to a relative `/uploads/...` path.
 *
 * Question stems must persist media as relative `/uploads/` paths so the
 * server-side stem guard (`^/uploads/`) accepts them and records stay portable
 * across deployments. The TipTap editor used to store absolute URLs, so this
 * also re-relativizes legacy stems on load → re-save then passes the guard.
 *
 * SECURITY: this ONLY strips our own backend origin. A foreign absolute URL
 * such as `https://evil.com/uploads/x` is returned UNCHANGED so it stays
 * absolute and the server-side guard rejects it on save — relativizing it would
 * smuggle an external resource past the `^/uploads/` check.
 */
export function relativizeMediaUrl(url: string): string {
  const origin = backendOrigin();
  // No configured origin (same-origin web build) → nothing to strip; a stem
  // media value is already relative `/uploads/...` in that deployment.
  if (!origin) return url;
  const prefix = `${origin}/uploads/`;
  if (url.startsWith(prefix)) {
    // Re-expose the leading "/uploads/" the prefix consumed.
    return url.slice(origin.length);
  }
  return url;
}
