/**
 * Azhura CBT Console — Supervisor Exam List Page (#88).
 *
 * Lists exams assigned to the logged-in supervisor. Each row links to the
 * question management page for that exam.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AssignedExam } from "../../types";
import { supervisorQuestionsApi } from "../../lib/supervisor-questions-api";
import { getErrorMessage } from "../../lib/errors";
import { formatDuration, formatDateTime } from "../../lib/format";
import { toast } from "../../stores/toast";
import { Spinner } from "../ui/Spinner";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { FileTextIcon } from "../ui/icons";

export function SupervisorExamListPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<AssignedExam[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await supervisorQuestionsApi.listExams();
      setExams(data);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (exams.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-faint">
        <FileTextIcon className="size-10 opacity-30" />
        <p className="text-sm">Belum ada ujian yang ditugaskan ke kamu.</p>
        <p className="text-xs">Hubungi admin untuk mendapatkan akses ke ujian.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Ujian yang Ditugaskan</h1>
        <p className="mt-0.5 text-sm text-faint">
          Pilih ujian untuk mengelola soal-soalnya.
        </p>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas">
              <th className="px-4 py-3 text-left text-xs font-medium text-faint">Judul Ujian</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-faint">Durasi</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-faint">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-faint">Dibuat</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {exams.map((exam) => (
              <tr key={exam.id} className="hover:bg-canvas/50">
                <td className="px-4 py-3 font-medium text-ink">{exam.title}</td>
                <td className="px-4 py-3 text-ink-soft">
                  {formatDuration(exam.durationMinutes)}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={exam.isActive ? "positive" : "neutral"}>
                    {exam.isActive ? "Aktif" : "Nonaktif"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {formatDateTime(exam.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      navigate(`/supervisor/exams/${exam.id}/questions`)
                    }
                  >
                    Kelola Soal
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
