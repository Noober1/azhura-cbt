/**
 * Azhura CBT Console — kartu soal bersama (admin + supervisor).
 *
 * Satu sumber tampilan untuk item "Daftar Soal" di <ExamDetailPage/> (admin)
 * dan <SupervisorQuestionListPage/> (supervisor): badge nomor, badge tipe
 * soal, teks soal (HTML via <QuestionContentRenderer/>), kunci jawaban per
 * tipe, dan aksi edit/hapus. Console memang menampilkan kunci jawaban —
 * halaman ini bukan client siswa.
 *
 * Aturan visual final (gabungan terbaik kedua halaman):
 * - Nomor: badge bulat accent (gaya admin).
 * - Opsi pilihan ganda `text-sm`: huruf SELALU tampil; opsi benar ditandai
 *   CheckIcon di samping huruf + `bg-positive-wash` (tanpa baris redundan
 *   "Jawaban benar: X").
 * - Aksi: <IconButton/> dengan dukungan `disabled` (admin meneruskan lock).
 */

import type {
  FillInBlankConfig,
  MatchingConfig,
  QuestionType,
  SortingConfig,
} from "@azhura/shared";
import type { AdminQuestion } from "../../types";
import { parseConfig, QUESTION_TYPE_LABELS } from "../../lib/question-display";
import { IconButton } from "../ui/IconButton";
import { CheckIcon, PencilIcon, TrashIcon } from "../ui/icons";
import { QuestionContentRenderer } from "../supervisor/QuestionContentRenderer";

interface QuestionCardProps {
  question: AdminQuestion;
  /** Posisi 0-based dalam daftar; ditampilkan sebagai nomor `index + 1`. */
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  /** Mengunci aksi edit/hapus (admin: saat ada peserta aktif). */
  disabled?: boolean;
}

/** Kunci jawaban pilihan ganda: daftar opsi dengan huruf + tanda ✓. */
function MultipleChoiceOptions({ question }: { question: AdminQuestion }) {
  if (question.options.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-col gap-1.5 pl-10">
      {question.options.map((opt, oi) => {
        const isCorrect = opt.id === question.correctOptionId;
        return (
          <li
            key={opt.id}
            className={`flex items-start gap-2 rounded-md px-2.5 py-1.5 text-sm ${
              isCorrect ? "bg-positive-wash font-medium text-ink" : "text-ink-soft"
            }`}
          >
            <span
              className={`flex shrink-0 items-center gap-1 pt-0.5 ${
                isCorrect ? "text-positive" : "text-faint"
              }`}
            >
              <span className="w-4 text-xs font-semibold tabular">
                {String.fromCharCode(65 + oi)}.
              </span>
              {isCorrect ? (
                <span role="img" aria-label="Jawaban benar" className="grid place-items-center">
                  <CheckIcon className="size-4" />
                </span>
              ) : (
                // Spacer selebar ikon agar teks opsi tetap sejajar antar baris.
                <span className="size-4" aria-hidden="true" />
              )}
            </span>
            <QuestionContentRenderer html={opt.text} />
          </li>
        );
      })}
    </ul>
  );
}

/** Kunci jawaban non-pilihan-ganda, dirender sesuai tipe soal. */
function AnswerKey({ question, type }: { question: AdminQuestion; type: QuestionType }) {
  if (type === "fill_in_blank") {
    return (
      <div className="mt-3 pl-10">
        <span className="text-xs text-faint">
          Jawaban benar:{" "}
          <span className="font-semibold text-positive">
            {parseConfig<FillInBlankConfig>(question.config)?.answer ?? "—"}
          </span>
        </span>
      </div>
    );
  }

  if (type === "matching") {
    return (
      <div className="mt-3 pl-10 space-y-1">
        <p className="text-xs font-medium text-faint">Pasangan benar:</p>
        {(parseConfig<MatchingConfig>(question.config)?.pairs ?? []).map((pair, pi) => (
          <div key={pi} className="flex items-center gap-2 text-xs text-ink-soft">
            <span className="rounded bg-canvas px-1.5 py-0.5 font-medium">{pair.left || "—"}</span>
            <span className="text-faint">→</span>
            <span className="rounded bg-canvas px-1.5 py-0.5 font-medium">{pair.right || "—"}</span>
          </div>
        ))}
      </div>
    );
  }

  if (type === "sorting") {
    return (
      <div className="mt-3 pl-10 space-y-1">
        <p className="text-xs font-medium text-faint">Urutan benar:</p>
        {(parseConfig<SortingConfig>(question.config)?.items ?? []).map((item, si) => (
          <div key={si} className="flex items-center gap-2 text-xs text-ink-soft">
            <span className="w-4 shrink-0 font-semibold text-faint">{si + 1}.</span>
            <span>{item || "—"}</span>
          </div>
        ))}
      </div>
    );
  }

  return <MultipleChoiceOptions question={question} />;
}

export function QuestionCard({ question, index, onEdit, onDelete, disabled = false }: QuestionCardProps) {
  // Soal lama tanpa kolom `type` diperlakukan sebagai pilihan ganda.
  const qType = (question.type ?? "multiple_choice") as QuestionType;
  const meta = QUESTION_TYPE_LABELS[qType];

  return (
    <li className="list-none rounded-[var(--radius-card)] border-[2.5px] border-[var(--nb-ink)] bg-surface shadow-[3px_3px_0_var(--nb-ink)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-wash text-xs font-semibold text-accent-strong tabular">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <span className={`mb-1.5 inline-block rounded border px-2 py-0.5 text-xs font-medium ${meta.className}`}>
              {meta.label}
            </span>
            <QuestionContentRenderer html={question.text} className="text-sm font-medium leading-relaxed" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            icon={<PencilIcon className="size-4" />}
            label={`Edit soal ${index + 1}`}
            disabled={disabled}
            onClick={disabled ? undefined : onEdit}
          />
          <IconButton
            icon={<TrashIcon className="size-4" />}
            label={`Hapus soal ${index + 1}`}
            variant="danger"
            disabled={disabled}
            onClick={disabled ? undefined : onDelete}
          />
        </div>
      </div>

      <AnswerKey question={question} type={qType} />
    </li>
  );
}
