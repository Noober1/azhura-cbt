/**
 * Azhura CBT Console — Admin Log Viewer (#18).
 *
 * Admin-only debugging surface. Two modes share one filter bar:
 * - **Riwayat** — DB-backed, filtered, paginated history (`GET /admin/logs`).
 * - **Live** — realtime tail of the `log-entry` socket stream (newest first),
 *   filtered client-side by the same controls.
 *
 * Sensitive fields are redacted server-side before they ever reach this view.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LogBroadcast, LogEntry, LogStream } from "@azhura/shared";
import { logsApi } from "../../lib/logs-api";
import { getErrorMessage } from "../../lib/errors";
import { useLogStream } from "./useLogStream";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Spinner, CenterState } from "../ui/Spinner";
import { ScrollTextIcon, ChevronLeftIcon, ChevronRightIcon } from "../ui/icons";

const PAGE_SIZE = 50;

const STREAM_TONE: Record<LogStream, "danger" | "warn" | "neutral" | "positive"> = {
  error: "danger",
  warn: "warn",
  access: "neutral",
  event: "positive",
};

const STREAM_OPTIONS: { value: "" | LogStream; label: string }[] = [
  { value: "", label: "Semua stream" },
  { value: "event", label: "Event" },
  { value: "error", label: "Error" },
  { value: "warn", label: "Warning" },
  { value: "access", label: "Access" },
];

/** Active filter state shared by both modes. */
interface Filters {
  stream: "" | LogStream;
  eventType: string;
  actorId: string;
}

const EMPTY_FILTERS: Filters = { stream: "", eventType: "", actorId: "" };

/**
 * One-click presets for client telemetry (#172). Each pins `stream=event` plus
 * the eventType written by the ingest endpoint (#169), so admins can jump
 * straight to crash reports or manual bug reports without typing.
 */
const TELEMETRY_PRESETS: { label: string; eventType: string }[] = [
  { label: "Client error", eventType: "client_error" },
  { label: "Bug report", eventType: "bug_report" },
];

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** True when a live entry passes the current client-side filters. */
function matchesFilters(entry: LogBroadcast, f: Filters): boolean {
  if (f.stream && entry.stream !== f.stream) return false;
  if (f.eventType && entry.eventType !== f.eventType) return false;
  if (f.actorId && entry.actorId !== f.actorId) return false;
  return true;
}

function StreamCell({ entry }: { entry: LogBroadcast }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Badge tone={STREAM_TONE[entry.stream]}>{entry.stream}</Badge>
      {entry.eventType && (
        <span className="text-[11px] font-medium text-neutral-500">{entry.eventType}</span>
      )}
    </div>
  );
}

/** One log row, shared by the live and history tables. `id` is null for live. */
function LogRow({ entry }: { entry: LogBroadcast & { id?: number } }) {
  const fields = entry.fields ? JSON.stringify(entry.fields) : "";
  return (
    <tr className="border-b border-neutral-100 align-top last:border-0 hover:bg-neutral-50/60">
      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-neutral-500">
        {formatTime(entry.timestamp)}
      </td>
      <td className="px-3 py-2">
        <StreamCell entry={entry} />
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-neutral-600">
        {entry.actorRole ? (
          <span>
            {entry.actorRole}
            {entry.actorId ? <span className="text-neutral-400"> · {entry.actorId.slice(0, 8)}</span> : null}
          </span>
        ) : (
          <span className="text-neutral-300">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <p className="text-sm text-neutral-800">{entry.message}</p>
        {fields && (
          <p
            className="mt-0.5 truncate font-mono text-[11px] text-neutral-400"
            title={fields}
          >
            {fields}
          </p>
        )}
      </td>
    </tr>
  );
}

function LogTable({
  rows,
  emptyLabel,
}: {
  rows: (LogBroadcast & { id?: number })[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <CenterState>{emptyLabel}</CenterState>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-[2.5px] border-[var(--nb-ink)] bg-highlight text-left text-xs font-extrabold uppercase tracking-wider text-ink">
            <th className="px-3 py-2.5">Waktu</th>
            <th className="px-3 py-2.5">Stream</th>
            <th className="px-3 py-2.5">Aktor</th>
            <th className="px-3 py-2.5">Pesan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry, i) => (
            <LogRow key={entry.id ?? `live-${entry.timestamp}-${i}`} entry={entry} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LogViewerPage() {
  const [mode, setMode] = useState<"history" | "live">("history");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // Committed filters: applied on submit so typing doesn't refetch per keystroke.
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { live, connected, clear } = useLogStream(mode === "live");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await logsApi.query({
        stream: applied.stream || undefined,
        eventType: applied.eventType || undefined,
        actorId: applied.actorId || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setRows(res.rows);
      setTotal(res.total);
    } catch (err) {
      setError(getErrorMessage(err, "Gagal memuat log."));
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => {
    if (mode === "history") void fetchHistory();
  }, [mode, fetchHistory]);

  const liveRows = useMemo(
    () => live.filter((e) => matchesFilters(e, applied)),
    [live, applied]
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const applyFilters = () => {
    setPage(1);
    setApplied(filters);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  /**
   * Applies a client-telemetry preset (#172): pins stream=event + the report's
   * eventType and commits it immediately (no separate "Terapkan" click).
   */
  const applyPreset = (eventType: string) => {
    const next: Filters = { stream: "event", eventType, actorId: "" };
    setFilters(next);
    setApplied(next);
    setPage(1);
  };

  /** True when the given preset is the currently committed filter. */
  const isPresetActive = (eventType: string) =>
    applied.stream === "event" &&
    applied.eventType === eventType &&
    applied.actorId === "";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-neutral-900 text-white">
            <ScrollTextIcon className="size-[18px]" />
          </span>
          <div>
            <h1 className="text-lg font-bold text-neutral-900">Log Aplikasi</h1>
            <p className="text-xs text-neutral-500">
              Audit & debugging — login, ujian, aksi pengawas, dan error.
            </p>
          </div>
        </div>

        {/* Mode switch */}
        <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setMode("history")}
            className={`rounded-md px-3 py-1.5 ${mode === "history" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
          >
            Riwayat
          </button>
          <button
            type="button"
            onClick={() => { clear(); setMode("live"); }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${mode === "live" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
          >
            {mode === "live" && (
              <span
                className={`size-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-neutral-400"}`}
                aria-hidden="true"
              />
            )}
            Live
          </button>
        </div>
      </header>

      {/* Quick filters for client telemetry (#172) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-neutral-500">Telemetri klien:</span>
        {TELEMETRY_PRESETS.map((preset) => (
          <Button
            key={preset.eventType}
            type="button"
            variant={isPresetActive(preset.eventType) ? "primary" : "ghost"}
            onClick={() => applyPreset(preset.eventType)}
            aria-pressed={isPresetActive(preset.eventType)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Filter bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters();
        }}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-3"
      >
        <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-600">
          Stream
          <select
            value={filters.stream}
            onChange={(e) => setFilters((f) => ({ ...f, stream: e.target.value as Filters["stream"] }))}
            className="h-9 rounded-md border border-neutral-200 bg-white px-2 text-sm font-normal text-neutral-900"
          >
            {STREAM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-600">
          Tipe Event
          <input
            value={filters.eventType}
            onChange={(e) => setFilters((f) => ({ ...f, eventType: e.target.value.trim() }))}
            placeholder="login, exam_start…"
            className="h-9 rounded-md border border-neutral-200 px-2 text-sm font-normal text-neutral-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-600">
          Actor ID
          <input
            value={filters.actorId}
            onChange={(e) => setFilters((f) => ({ ...f, actorId: e.target.value.trim() }))}
            placeholder="user id"
            className="h-9 rounded-md border border-neutral-200 px-2 text-sm font-normal text-neutral-900"
          />
        </label>

        <div className="flex items-center gap-2">
          <Button type="submit">Terapkan</Button>
          <Button type="button" variant="ghost" onClick={resetFilters}>Reset</Button>
        </div>
      </form>

      {/* Content */}
      {mode === "live" ? (
        <LogTable
          rows={liveRows}
          emptyLabel={connected ? "Menunggu log masuk…" : "Menyambung ke server…"}
        />
      ) : loading ? (
        <CenterState>
          <Spinner />
        </CenterState>
      ) : error ? (
        <CenterState>
          <div className="space-y-2 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="ghost" onClick={() => void fetchHistory()}>Coba lagi</Button>
          </div>
        </CenterState>
      ) : (
        <>
          <LogTable rows={rows} emptyLabel="Tidak ada log yang cocok." />
          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-neutral-500">
            <span>
              {total.toLocaleString("id-ID")} entri · halaman {page} / {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeftIcon className="size-4" /> Sebelumnya
              </Button>
              <Button
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Berikutnya <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
