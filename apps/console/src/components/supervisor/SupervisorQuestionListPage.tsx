/**
 * Azhura CBT Console — Supervisor Question List Page (#88).
 *
 * Lists all questions for an assigned exam. Supervisors can add, edit, and
 * delete questions from here. Setiap soal dirender lewat <QuestionCard/>
 * bersama (dipakai juga halaman admin) sehingga tampilan daftar soal kedua
 * peran konsisten — termasuk KaTeX math dan media tersemat.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import type { AdminQuestion } from "../../types";
import type { SupervisorExamDetail } from "@azhura/shared";
import { supervisorQuestionsApi } from "../../lib/supervisor-questions-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { Spinner } from "../ui/Spinner";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PlusIcon, ChevronLeftIcon } from "../ui/icons";
import { ExamContextCard } from "../exams/ExamContextCard";
import { QuestionCard } from "../questions/QuestionCard";
import { QuestionListEmptyState } from "../questions/QuestionListEmptyState";

export function SupervisorQuestionListPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [exam, setExam] = useState<SupervisorExamDetail | null>(null);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<AdminQuestion | null>(null);

  const load = useCallback(async () => {
    if (!examId) return;
    try {
      setLoading(true);
      const [examData, questionData] = await Promise.all([
        supervisorQuestionsApi.getExam(examId),
        supervisorQuestionsApi.listQuestions(examId),
      ]);
      setExam(examData);
      setQuestions(questionData);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!examId || !deleteTarget) return;
    try {
      await supervisorQuestionsApi.deleteQuestion(examId, deleteTarget.id);
      toast.success("Soal dihapus.");
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal menghapus soal."));
      throw err; // keep the confirm dialog open so the user can retry
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/supervisor/exams"
          className="focus-ring inline-flex items-center gap-1 rounded-md text-sm text-faint hover:text-ink"
        >
          <ChevronLeftIcon className="size-4" />
          Ujian
        </Link>
        <span className="text-faint">/</span>
        <h1 className="text-lg font-semibold text-ink">Daftar Soal</h1>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => navigate(`/supervisor/exams/${examId}/questions/new`)}
          leadingIcon={<PlusIcon className="size-4" />}
        >
          Tambah Soal
        </Button>
      </div>

      {/* Exam context — read-only for supervisors (no token, no admin actions). */}
      {exam && (
        <ExamContextCard
          title={exam.title}
          as="h2"
          durationMinutes={exam.durationMinutes}
          isActive={exam.isActive}
          expiredAt={exam.expiredAt}
          allowedGroupNames={exam.allowedGroupNames}
          passingGrade={exam.passingGrade}
          questionCount={questions.length}
        />
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : questions.length === 0 ? (
        <QuestionListEmptyState
          onAdd={() => navigate(`/supervisor/exams/${examId}/questions/new`)}
        />
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {questions.map((q, index) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={index}
              onEdit={() => navigate(`/supervisor/exams/${examId}/questions/${q.id}/edit`)}
              onDelete={() => setDeleteTarget(q)}
            />
          ))}
        </ol>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Soal?"
        message="Tindakan ini tidak dapat dibatalkan. Soal dan semua opsinya akan dihapus permanen."
        confirmLabel="Hapus"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
