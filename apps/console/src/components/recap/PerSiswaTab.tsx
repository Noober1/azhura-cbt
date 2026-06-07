/**
 * Azhura CBT Console — Recap per-siswa tab (#19).
 *
 * Search for a student, then see their exam history with server-computed scores
 * and a summary (exams taken / completed / average). Filterable by exam and
 * session-start range, paginated. Source: `GET /admin/recap/students/:id`.
 */

import { useCallback, useEffect, useState } from "react";
import { studentsApi } from "../../lib/students-api";
import { examsApi } from "../../lib/exams-api";
import { recapApi } from "../../lib/recap-api";
import { useDebounce } from "../../hooks/useDebounce";
import { getErrorMessage } from "../../lib/errors";
import { formatDateTime, fromDatetimeLocal } from "../../lib/format";
import type { ExamSummary, StudentRecapResponse, StudentSummary } from "../../types";
import { Badge } from "../ui/Badge";
import { Select } from "../ui/Select";
import { Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { Spinner, CenterState } from "../ui/Spinner";
import { SearchIcon, ChevronLeftIcon, ChevronRightIcon } from "../ui/icons";
import { RecapStatusBadge, StatCard, ScoreCell, formatScore } from "./RecapShared";

const PAGE_SIZE = 20;
const EXAM_PICKER_LIMIT = 100;
const SEARCH_LIMIT = 8;

export function PerSiswaTab() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [results, setResults] = useState<StudentSummary[]>([]);
  const [searching, setSearching] = useState(false);

  const [selected, setSelected] = useState<StudentSummary | null>(null);
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [examId, setExamId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<StudentRecapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the exam filter list once.
  useEffect(() => {
    examsApi
      .list({ limit: EXAM_PICKER_LIMIT })
      .then((res) => setExams(res.data))
      .catch(() => {
        /* exam filter is optional — ignore load failure */
      });
  }, []);

  // Search students (only while no student is selected).
  useEffect(() => {
    if (selected) return;
    const q = debouncedSearch.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let active = true;
    setSearching(true);
    studentsApi
      .list({ q, limit: SEARCH_LIMIT })
      .then((res) => active && setResults(res.data))
      .catch((err) => active && setError(getErrorMessage(err, "Gagal mencari siswa.")))
      .finally(() => active && setSearching(false));
    return () => {
      active = false;
    };
  }, [debouncedSearch, selected]);

  const load = useCallback(async () => {
    if (!selected) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await recapApi.studentRecap(selected.id, {
        examId: examId || undefined,
        from: from ? fromDatetimeLocal(from) : undefined,
        to: to ? fromDatetimeLocal(to) : undefined,
        page,
        limit: PAGE_SIZE,
      });
      setData(res);
    } catch (err) {
      setError(getErrorMessage(err, "Gagal memuat rekap siswa."));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selected, examId, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [selected, examId, from, to]);

  function selectStudent(student: StudentSummary) {
    setSelected(student);
    setResults([]);
    setSearch("");
  }

  function clearStudent() {
    setSelected(null);
    setData(null);
    setExamId("");
    setFrom("");
    setTo("");
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  // ── Student picker (no student selected yet) ──────────────────────────────
  if (!selected) {
    return (
      <div>
        <div className="relative max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama atau NIS siswa…"
            className="pl-9"
            aria-label="Cari siswa"
          />
        </div>

        {searching ? (
          <CenterState>
            <Spinner className="size-6 text-accent" />
            <span>Mencari siswa…</span>
          </CenterState>
        ) : debouncedSearch.trim() && results.length === 0 ? (
          <div className="mt-4 rounded-[var(--radius-card)] border border-dashed border-line bg-surface">
            <CenterState>
              <span>Tidak ada siswa yang cocok.</span>
            </CenterState>
          </div>
        ) : results.length > 0 ? (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line">
            {results.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => selectStudent(s)}
                  className="focus-ring flex w-full items-center justify-between gap-3 bg-surface px-4 py-3 text-left transition-colors hover:bg-canvas/60"
                >
                  <span>
                    <span className="font-medium text-ink">{s.name}</span>
                    <span className="tabular ml-2 text-sm text-faint">{s.nis}</span>
                  </span>
                  {s.groupName && <Badge tone="accent">{s.groupName}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-6 rounded-[var(--radius-card)] border border-dashed border-line bg-surface">
            <CenterState>
              <span>Cari siswa untuk melihat riwayat ujian &amp; nilainya.</span>
            </CenterState>
          </div>
        )}
      </div>
    );
  }

  // ── Selected student recap ────────────────────────────────────────────────
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">
            {selected.name}
            <span className="tabular ml-2 text-sm font-normal text-faint">{selected.nis}</span>
          </h2>
          {data?.student.groupName && (
            <Badge tone="accent" className="mt-1">
              {data.student.groupName}
            </Badge>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={clearStudent}>
          Ganti siswa
        </Button>
      </div>

      {/* Filters */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-faint">Paket ujian</span>
          <Select value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">Semua ujian</option>
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-faint">Mulai dari</span>
          <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-faint">Sampai</span>
          <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {loading ? (
        <CenterState>
          <Spinner className="size-6 text-accent" />
          <span>Memuat rekap…</span>
        </CenterState>
      ) : error ? (
        <CenterState>
          <span className="text-danger">{error}</span>
          <Button variant="secondary" size="sm" onClick={load}>
            Coba lagi
          </Button>
        </CenterState>
      ) : data ? (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <StatCard label="Ujian diikuti" value={data.stats.examsTaken} />
            <StatCard label="Selesai" value={data.stats.completedCount} />
            <StatCard label="Rata-rata" value={formatScore(data.stats.average)} />
          </div>

          {data.history.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-card)] border border-dashed border-line bg-surface">
              <CenterState>
                <span>Belum ada riwayat ujian yang cocok dengan filter ini.</span>
              </CenterState>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-line">
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-canvas">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-faint">Ujian</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-faint">Status</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-faint">Skor</th>
                    <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-faint lg:table-cell">Mulai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.history.map((h) => (
                    <tr key={h.sessionId} className="bg-surface">
                      <td className="px-4 py-3 font-medium text-ink">{h.examTitle}</td>
                      <td className="px-4 py-3">
                        <RecapStatusBadge status={h.status} />
                      </td>
                      <td className="px-4 py-3">
                        <ScoreCell
                          score={h.score}
                          totalCorrect={h.totalCorrect}
                          totalWrong={h.totalWrong}
                          totalEmpty={h.totalEmpty}
                        />
                      </td>
                      <td className="hidden px-4 py-3 text-ink-soft lg:table-cell">
                        {formatDateTime(h.startTime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-faint">
              <span className="tabular">
                Halaman {page} dari {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  leadingIcon={<ChevronLeftIcon className="size-4" />}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Berikutnya
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
