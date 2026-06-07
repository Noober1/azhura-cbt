/**
 * Azhura CBT Console — Recap per-paket tab (#19).
 *
 * Pick an exam, then see every participant's server-computed score plus class
 * statistics (average / highest / lowest / completed). Filterable by group and
 * session-start range, paginated. The score source is `GET /admin/recap/exams/:id`.
 */

import { useCallback, useEffect, useState } from "react";
import { examsApi } from "../../lib/exams-api";
import { recapApi } from "../../lib/recap-api";
import { useGroups } from "../../hooks/useGroups";
import { getErrorMessage } from "../../lib/errors";
import { saveBlob } from "../../lib/download";
import { toast } from "../../stores/toast";
import { formatDateTime, fromDatetimeLocal } from "../../lib/format";
import type { ExamRecapResponse, ExamSummary } from "../../types";
import { Badge } from "../ui/Badge";
import { Select } from "../ui/Select";
import { Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { Spinner, CenterState } from "../ui/Spinner";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from "../ui/icons";
import { RecapStatusBadge, StatCard, ScoreCell, formatScore } from "./RecapShared";

const PAGE_SIZE = 20;
const EXAM_PICKER_LIMIT = 100;

export function PerPaketTab() {
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [examId, setExamId] = useState("");
  const { groups } = useGroups();

  const [groupId, setGroupId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ExamRecapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Filters shared by the recap query and the Excel export.
  const filters = {
    groupId: groupId || undefined,
    from: from ? fromDatetimeLocal(from) : undefined,
    to: to ? fromDatetimeLocal(to) : undefined,
  };

  async function onExport() {
    setExporting(true);
    try {
      const { blob, filename } = await recapApi.examRecapXlsx(examId, filters);
      saveBlob(blob, filename);
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal mengekspor rekap ke Excel."));
    } finally {
      setExporting(false);
    }
  }

  // Load the exam picker once.
  useEffect(() => {
    examsApi
      .list({ limit: EXAM_PICKER_LIMIT })
      .then((res) => setExams(res.data))
      .catch((err) => setError(getErrorMessage(err, "Gagal memuat daftar ujian.")));
  }, []);

  const load = useCallback(async () => {
    if (!examId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await recapApi.examRecap(examId, {
        groupId: groupId || undefined,
        from: from ? fromDatetimeLocal(from) : undefined,
        to: to ? fromDatetimeLocal(to) : undefined,
        page,
        limit: PAGE_SIZE,
      });
      setData(res);
    } catch (err) {
      setError(getErrorMessage(err, "Gagal memuat rekap ujian."));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [examId, groupId, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset to page 1 whenever the exam or a filter changes.
  useEffect(() => {
    setPage(1);
  }, [examId, groupId, from, to]);

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div>
      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-faint">Paket ujian</span>
          <Select value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">Pilih ujian…</option>
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-faint">Group</span>
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!examId}>
            <option value="">Semua group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-faint">Mulai dari</span>
          <Input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={!examId}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-faint">Sampai</span>
          <Input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={!examId}
          />
        </label>
      </div>

      {!examId ? (
        <div className="mt-6 rounded-[var(--radius-card)] border border-dashed border-line bg-surface">
          <CenterState>
            <span>Pilih paket ujian untuk melihat rekap nilai peserta.</span>
          </CenterState>
        </div>
      ) : loading ? (
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
          {/* Export toolbar */}
          <div className="mt-6 flex items-center justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={onExport}
              disabled={exporting || data.total === 0}
              leadingIcon={
                exporting ? (
                  <Spinner className="size-4" />
                ) : (
                  <DownloadIcon className="size-4" />
                )
              }
            >
              {exporting ? "Mengekspor…" : "Export Excel"}
            </Button>
          </div>

          {/* Statistics */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Rata-rata" value={formatScore(data.stats.average)} />
            <StatCard label="Tertinggi" value={formatScore(data.stats.highest)} />
            <StatCard label="Terendah" value={formatScore(data.stats.lowest)} />
            <StatCard
              label="Selesai"
              value={data.stats.completedCount}
              hint={`dari ${data.stats.totalParticipants} peserta`}
            />
          </div>

          {/* Participants */}
          {data.participants.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-card)] border border-dashed border-line bg-surface">
              <CenterState>
                <span>Belum ada peserta yang cocok dengan filter ini.</span>
              </CenterState>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-line">
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-canvas">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-faint">Nama</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-faint tabular">NIS</th>
                    <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-faint md:table-cell">Group</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-faint">Status</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-faint">Skor</th>
                    <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-faint lg:table-cell">Mulai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.participants.map((p) => (
                    <tr key={p.sessionId} className="bg-surface">
                      <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                      <td className="tabular px-4 py-3 text-ink-soft">{p.nis}</td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        {p.groupName ? (
                          <Badge tone="accent">{p.groupName}</Badge>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <RecapStatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3">
                        <ScoreCell
                          score={p.score}
                          totalCorrect={p.totalCorrect}
                          totalWrong={p.totalWrong}
                          totalEmpty={p.totalEmpty}
                        />
                      </td>
                      <td className="hidden px-4 py-3 text-ink-soft lg:table-cell">
                        {formatDateTime(p.startTime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
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
