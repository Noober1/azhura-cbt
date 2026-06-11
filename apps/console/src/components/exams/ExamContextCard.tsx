/**
 * Azhura CBT Console — Exam context card (#141).
 *
 * Presentational, read-only summary of an exam shown above the question list on
 * both the admin exam-detail page (`ExamDetailPage`) and the supervisor question
 * page (`SupervisorQuestionListPage`). It renders status badges, title, duration,
 * expiry, allowed groups, and — for the supervisor view — passing grade and
 * question count.
 *
 * It does NO data fetching and owns NO actions: the admin's "Edit ujian" / "Status
 * peserta" buttons are passed in via the `actions` slot and remain owned by the
 * caller. The access `token` is only rendered when `showToken` is explicitly true,
 * so supervisors (who omit it) never see it.
 */

import type { ReactNode } from "react";
import { Badge } from "../ui/Badge";
import { ClockIcon, KeyIcon } from "../ui/icons";
import { formatDateTime, formatDuration, isPast } from "../../lib/format";

export interface ExamContextCardProps {
  /** Exam display name. */
  title: string;
  /** Total working time, in minutes. */
  durationMinutes: number;
  /** Whether the exam is active (open to students). */
  isActive: boolean;
  /** Exam expiry, epoch milliseconds. */
  expiredAt: number;
  /** Display names of the groups allowed to take this exam. */
  allowedGroupNames: string[];
  /**
   * Access token. Only rendered when {@link showToken} is true. Supervisors must
   * not see the token, so they omit `showToken` (default false) entirely.
   */
  token?: string | null;
  /** Reveal the access token in the meta row. Admin-only — defaults to hidden. */
  showToken?: boolean;
  /** Minimum passing score (0–100). When provided, shown as a chip. */
  passingGrade?: number;
  /** Number of questions in the exam. When provided, shown as a chip. */
  questionCount?: number;
  /** Whether question order is randomized. Admin-only chip; omit to hide. */
  randomizeQuestion?: boolean;
  /** Whether answer order is randomized. Admin-only chip; omit to hide. */
  randomizeAnswer?: boolean;
  /**
   * Batch numbers allowed to access the exam. Admin-only chip; omit to hide.
   * An empty array renders as "Semua batch".
   */
  batches?: number[];
  /**
   * Heading level for the title. The admin page uses `h1` (default, it's the page
   * heading); embedded views like the supervisor page pass `"h2"` to avoid a
   * duplicate page-level `<h1>`.
   */
  as?: "h1" | "h2";
  /** Action buttons rendered top-right inside the header (owned by the caller). */
  actions?: ReactNode;
}

export function ExamContextCard({
  title,
  durationMinutes,
  isActive,
  expiredAt,
  allowedGroupNames,
  token,
  showToken = false,
  passingGrade,
  questionCount,
  randomizeQuestion,
  randomizeAnswer,
  batches,
  as: Heading = "h1",
  actions,
}: ExamContextCardProps) {
  const showPassingGrade = passingGrade !== undefined;
  const showQuestionCount = questionCount !== undefined;
  const showRandomize = randomizeQuestion !== undefined && randomizeAnswer !== undefined;
  const showBatches = batches !== undefined;

  return (
    <section className="rounded-[var(--radius-card)] border-[2.5px] border-[var(--nb-ink)] bg-surface shadow-[3px_3px_0_var(--nb-ink)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isActive ? (
              <Badge tone="positive">Aktif</Badge>
            ) : (
              <Badge tone="neutral">Nonaktif</Badge>
            )}
            {isPast(expiredAt) && <Badge tone="danger">Kedaluwarsa</Badge>}
          </div>
          <Heading className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            {title}
          </Heading>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-faint">
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon className="size-4" />
              {formatDuration(durationMinutes)}
            </span>
            <span>Kedaluwarsa {formatDateTime(expiredAt)}</span>
            {showToken && token && (
              <span className="inline-flex items-center gap-1.5">
                <KeyIcon className="size-4" />
                <span className="tabular font-medium text-ink-soft">{token}</span>
              </span>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      {/* Chip row — the Group chip is always present, so the row is unconditional. */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4 text-xs text-faint">
        {showRandomize && (
          <>
            <span className="rounded-md bg-canvas px-2 py-1">
              Acak soal: {randomizeQuestion ? "Ya" : "Tidak"}
            </span>
            <span className="rounded-md bg-canvas px-2 py-1">
              Acak jawaban: {randomizeAnswer ? "Ya" : "Tidak"}
            </span>
          </>
        )}
        {showPassingGrade && (
          <span className="rounded-md bg-canvas px-2 py-1">
            Nilai lulus: {passingGrade > 0 ? `${passingGrade}` : "Tidak ada"}
          </span>
        )}
        {showQuestionCount && (
          <span className="rounded-md bg-canvas px-2 py-1">
            Jumlah soal: {questionCount}
          </span>
        )}
        <span className="rounded-md bg-canvas px-2 py-1">
          Group: {allowedGroupNames.length > 0 ? allowedGroupNames.join(", ") : "—"}
        </span>
        {showBatches && (
          <span className="rounded-md bg-canvas px-2 py-1">
            Batch: {batches.length > 0 ? batches.join(", ") : "Semua batch"}
          </span>
        )}
      </div>
    </section>
  );
}
