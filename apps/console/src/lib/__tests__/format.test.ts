import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatDateTime,
  formatDuration,
  toDatetimeLocal,
  fromDatetimeLocal,
  isPast,
  formatBytes,
  resolveMediaUrl,
} from "../format";

describe("formatDuration", () => {
  it("renders sub-hour durations as plain minutes", () => {
    expect(formatDuration(45)).toBe("45m");
  });

  it("renders zero minutes as 0m", () => {
    expect(formatDuration(0)).toBe("0m");
  });

  it("renders a whole-hour duration without trailing minutes", () => {
    expect(formatDuration(120)).toBe("2j");
  });

  it("renders hours and minutes together", () => {
    expect(formatDuration(90)).toBe("1j 30m");
  });

  it("treats exactly 60 minutes as one hour", () => {
    expect(formatDuration(60)).toBe("1j");
  });

  it("renders an hour with one trailing minute", () => {
    expect(formatDuration(61)).toBe("1j 1m");
  });
});

describe("formatBytes", () => {
  it("renders byte-scale values with a B suffix", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("renders zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("switches to KB at the 1024-byte boundary with one decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("rounds KB values to one decimal place", () => {
    // 320 KB exactly → 327680 bytes.
    expect(formatBytes(327680)).toBe("320.0 KB");
  });

  it("switches to MB at the 1 MiB boundary", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });

  it("renders multi-megabyte values with one decimal", () => {
    // 4.2 MB → 4.2 * 1024 * 1024 bytes.
    expect(formatBytes(Math.round(4.2 * 1024 * 1024))).toBe("4.2 MB");
  });
});

describe("toDatetimeLocal / fromDatetimeLocal", () => {
  it("round-trips an epoch to a datetime-local string and back (minute precision)", () => {
    // Truncate to the minute since datetime-local has no seconds.
    const epoch = new Date(2026, 5, 12, 14, 30, 0, 0).getTime();
    const local = toDatetimeLocal(epoch);
    expect(local).toBe("2026-06-12T14:30");
    expect(fromDatetimeLocal(local)).toBe(epoch);
  });

  it("zero-pads single-digit month, day, hour, and minute", () => {
    const epoch = new Date(2026, 0, 3, 9, 5, 0, 0).getTime();
    expect(toDatetimeLocal(epoch)).toBe("2026-01-03T09:05");
  });

  it("returns an empty string for non-finite epoch input", () => {
    expect(toDatetimeLocal(NaN)).toBe("");
    expect(toDatetimeLocal(Infinity)).toBe("");
  });

  it("returns NaN when parsing an empty datetime-local value", () => {
    expect(fromDatetimeLocal("")).toBeNaN();
  });

  it("returns NaN when parsing an invalid datetime-local value", () => {
    expect(fromDatetimeLocal("not-a-date")).toBeNaN();
  });
});

describe("isPast", () => {
  const NOW = new Date(2026, 5, 11, 12, 0, 0, 0).getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports an earlier instant as past", () => {
    expect(isPast(NOW - 1)).toBe(true);
  });

  it("reports the current instant as past (inclusive boundary)", () => {
    expect(isPast(NOW)).toBe(true);
  });

  it("reports a future instant as not past", () => {
    expect(isPast(NOW + 1)).toBe(false);
  });
});

describe("formatDateTime", () => {
  it("produces a stable Indonesian-locale string for a known instant", () => {
    // Built from local-time components so the assertion is timezone-independent.
    const epoch = new Date(2026, 5, 12, 14, 30, 0, 0).getTime();
    const out = formatDateTime(epoch);
    // id-ID short format includes a zero-padded day, abbreviated month, and year.
    expect(out).toContain("12");
    expect(out).toContain("2026");
    expect(out).toMatch(/Jun/i);
  });
});

describe("resolveMediaUrl", () => {
  it("returns absolute http URLs unchanged", () => {
    const url = "http://cdn.example.com/img/a.jpg";
    expect(resolveMediaUrl(url)).toBe(url);
  });

  it("returns absolute https URLs unchanged", () => {
    const url = "https://cdn.example.com/img/a.jpg";
    expect(resolveMediaUrl(url)).toBe(url);
  });

  it("prefixes a relative path with the backend origin derived from the API base URL", () => {
    // vitest defaults VITE_API_BASE_URL to undefined → fallback "/api" → origin "".
    // We assert the /api suffix is stripped and the relative path is appended.
    const resolved = resolveMediaUrl("/uploads/images/uuid.jpg");
    expect(resolved.endsWith("/uploads/images/uuid.jpg")).toBe(true);
    expect(resolved).not.toContain("/api/uploads");
  });
});
