/**
 * Azhura CBT Console — Exam participant sessions.
 *
 * Lists every recorded session (participant) for one exam with its derived
 * status, and lets an admin reset a completed session back to in_progress (#45).
 * Split out of the question manager (<ExamDetailPage/>) so that page stays
 * focused on question CRUD (#59); this page owns all participant/session UI.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../stores/auth";
import { examsApi } from "../../lib/exams-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import type { ExamDetail, ExamSessionRow, SessionStatus } from "../../types";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Spinner, CenterState } from "../ui/Spinner";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ChevronLeftIcon } from "../ui/icons";

const SESSION_STATUS: Record<SessionStatus, { tone: "accent" | "positive" | "neutral"; label: string }> = {
  in_progress: { tone: "accent", label: "Mengerjakan" },
  completed: { tone: "positive", label: "Selesai" },
  expired: { tone: "neutral", label: "Kedaluwarsa" },
};

function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const { tone, label } = SESSION_STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function ExamSessionsPage() {
  const { examId = "" } = useParams();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.role);

  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [sessions, setSessions] = useState<ExamSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resettingSession, setResettingSession] = useState<ExamSessionRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [examData, sessionsData] = await Promise.all([
        examsApi.get(examId),
        examsApi.listSessions(examId),
      ]);
      setExam(examData);
      setSessions(sessionsData);
    } catch (err) {
      setError(getErrorMessage(err, "Gagal memuat sesi peserta."));
    } finally {
      setLoading(false);
    }
  }, [examId]);

  const refresh = useCallback(async () => {
    try {
      const sessionsData = await examsApi.listSessions(examId);
      setSessions(sessionsData);
    } catch {
      // silent — polling errors don't surface to the user
    }
  }, [examId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function confirmResetSession() {
    if (!resettingSession) return;
    try {
      await examsApi.resetSession(resettingSession.id);
      toast.success(`Status ujian ${resettingSession.name} berhasil direset.`);
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal mereset status ujian."));
      throw err;
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <CenterState>
          <Spinner className="size-6 text-accent" />
          <span>Memuat sesi peserta…</span>
        </CenterState>
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="mx-auto max-w-4xl">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/exams")}
          leadingIcon={<ChevronLeftIcon className="size-4" />}
        >
          Kembali
        </Button>
        <CenterState>
          <span className="text-danger">{error ?? "Ujian tidak ditemukan."}</span>
          <Button variant="secondary" size="sm" onClick={load}>
            Coba lagi
          </Button>
        </CenterState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(`/exams/${examId}`)}
        leadingIcon={<ChevronLeftIcon className="size-4" />}
        className="-ml-2"
      >
        Kelola soal
      </Button>

      <div className="mt-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Status peserta</h1>
        <p className="mt-1 text-sm text-faint">
          {exam.title} — {sessions.length > 0 ? `${sessions.length} sesi tercatat` : "belum ada peserta"}
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius-card)] border border-dashed border-line bg-surface">
          <CenterState>
            <span>Belum ada peserta yang mengikuti ujian ini.</span>
          </CenterState>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[var(--radius-card)] border border-line">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-canvas">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-faint">Nama</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-faint tabular">NIS</th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-faint md:table-cell">Group</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-faint">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-faint">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sessions.map((s) => (
                <tr key={s.id} className="bg-surface">
                  <td className="px-4 py-3 font-medium text-ink">{s.name}</td>
                  <td className="tabular px-4 py-3 text-ink-soft">{s.nis}</td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {s.groupName ? (
                      <Badge tone="accent">{s.groupName}</Badge>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <SessionStatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.status === "completed" && role === "admin" && (
                      <button
                        onClick={() => setResettingSession(s)}
                        className="focus-ring rounded-md px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-wash"
                      >
                        Reset
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(resettingSession)}
        title="Reset status ujian?"
        message={`Reset ujian ${resettingSession?.name ?? ""}? Jawaban yang sudah dijawab tetap tersimpan. Peserta dapat melanjutkan ujian dari kondisi terakhir dengan waktu penuh.`}
        confirmLabel="Reset"
        tone="primary"
        onConfirm={confirmResetSession}
        onClose={() => setResettingSession(null)}
      />
    </div>
  );
}
