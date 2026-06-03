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
