import { useState } from "react";
import type { Question, MatchingStudentConfig } from "../../types";
import { useExamStore } from "../../stores/exam";
import { RichContent } from "./RichContent";

interface Props {
  question: Question;
  questionNumber: number;
}

/** Left column item: index into the `left` array (authored order). */
type LeftIdx = number;
/** Right column item: index into the `right` array (server-shuffled display order). */
type RightIdx = number;

/** Color palette for visualizing pairs */
const PAIR_COLORS = [
  "border-blue bg-blue/15",
  "border-green-400 bg-green-50",
  "border-purple-400 bg-purple-50",
  "border-orange-400 bg-orange-50",
  "border-pink-400 bg-pink-50",
  "border-cyan-400 bg-cyan-50",
];

export function MatchingQuestion({ question, questionNumber }: Props) {
  const { answers, submitAnswer } = useExamStore();
  // The server sends the two columns decoupled, with `right` already shuffled by
  // a secret per-session permutation — the client no longer shuffles (or ever
  // sees the correct pairing). The student submits [leftIndex, rightDisplayIndex]
  // pairs and the server grades them against the permutation it kept.
  const config = question.config as MatchingStudentConfig | null;
  const left = config?.left ?? [];
  const right = config?.right ?? [];

  // pairing: leftIdx → rightDisplayIdx
  const savedPairing = (() => {
    try {
      const v = answers[question.id]?.answerValue;
      if (!v) return {} as Record<LeftIdx, RightIdx>;
      const arr = JSON.parse(v) as [number, number][];
      return Object.fromEntries(arr) as Record<LeftIdx, RightIdx>;
    } catch {
      return {} as Record<LeftIdx, RightIdx>;
    }
  })();

  const [pairing, setPairing] = useState<Record<LeftIdx, RightIdx>>(savedPairing);
  const [selectedLeft, setSelectedLeft] = useState<LeftIdx | null>(null);

  function getColorIndex(leftIdx: LeftIdx): number | null {
    if (pairing[leftIdx] === undefined) return null;
    return leftIdx % PAIR_COLORS.length;
  }

  function getRightColorIndex(rightIdx: RightIdx): number | null {
    const leftIdx = Object.entries(pairing).find(([, r]) => r === rightIdx)?.[0];
    if (leftIdx === undefined) return null;
    return parseInt(leftIdx) % PAIR_COLORS.length;
  }

  function handleLeftClick(leftIdx: LeftIdx) {
    if (selectedLeft === leftIdx) {
      setSelectedLeft(null);
      return;
    }
    setSelectedLeft(leftIdx);
  }

  async function handleRightClick(rightIdx: RightIdx) {
    if (selectedLeft === null) {
      // Click right without selecting left: unpair whatever was paired here.
      const leftIdx = parseInt(
        Object.entries(pairing).find(([, r]) => r === rightIdx)?.[0] ?? "-1"
      );
      if (leftIdx >= 0) {
        const newPairing = { ...pairing };
        delete newPairing[leftIdx];
        setPairing(newPairing);
        await persist(newPairing);
      }
      return;
    }
    // Complete a pairing: left → rightIdx.
    const newPairing = { ...pairing };
    // Remove any existing pairing for this left and any existing pairing to this right.
    delete newPairing[selectedLeft];
    const prevLeft = parseInt(
      Object.entries(newPairing).find(([, r]) => r === rightIdx)?.[0] ?? "-1"
    );
    if (prevLeft >= 0) delete newPairing[prevLeft];
    newPairing[selectedLeft] = rightIdx;
    setPairing(newPairing);
    setSelectedLeft(null);
    await persist(newPairing);
  }

  async function persist(p: Record<LeftIdx, RightIdx>) {
    const arr = Object.entries(p).map(([l, r]) => [parseInt(l), r] as [number, number]);
    await submitAnswer(question.id, null, arr.length > 0 ? JSON.stringify(arr) : null);
  }

  const pairedCount = Object.keys(pairing).length;

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 rounded-2xl border-[2.5px] border-[var(--nb-ink)] bg-white shadow-[3px_3px_0_var(--nb-ink)]">
      <div className="flex items-center justify-between pb-4 border-b border-soft">
        <span className="text-sm font-semibold uppercase tracking-wider text-primary bg-primary/5 px-3 py-1 rounded-full">
          Pasangkan
        </span>
        <span className="text-sm font-bold text-muted-foreground">
          Nomor {questionNumber} dari {useExamStore.getState().questions.length}
        </span>
      </div>

      <RichContent
        html={question.text}
        questionId={question.id}
        className="question-html text-lg font-medium text-foreground leading-relaxed"
      />

      <div className="text-xs text-muted-foreground">
        Klik item di Kolom A, lalu klik pasangannya di Kolom B. ({pairedCount}/{left.length} dipasangkan)
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Left column */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kolom A</p>
          {left.map((label, leftIdx) => {
            const colorIdx = getColorIndex(leftIdx);
            const isSelected = selectedLeft === leftIdx;
            return (
              <button
                key={leftIdx}
                type="button"
                onClick={() => handleLeftClick(leftIdx)}
                className={`rounded-xl border-2 px-3 py-2.5 text-sm text-left font-medium transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : colorIdx !== null
                    ? `${PAIR_COLORS[colorIdx]} text-foreground`
                    : "border-soft bg-muted/50 text-foreground hover:border-soft dark:text-muted-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Right column (server-shuffled) */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kolom B</p>
          {right.map((label, rightIdx) => {
            const colorIdx = getRightColorIndex(rightIdx);
            return (
              <button
                key={rightIdx}
                type="button"
                onClick={() => handleRightClick(rightIdx)}
                className={`rounded-xl border-2 px-3 py-2.5 text-sm text-left font-medium transition-all ${
                  colorIdx !== null
                    ? `${PAIR_COLORS[colorIdx]} text-foreground`
                    : "border-soft bg-muted/50 text-foreground hover:border-primary/30 hover:border-2 dark:border-soft dark:text-muted-foreground"
                } ${selectedLeft !== null ? "cursor-pointer hover:border-primary/50" : ""}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
