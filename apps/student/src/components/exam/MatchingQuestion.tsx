import { useState } from "react";
import type { Question, MatchingConfig } from "../../types";
import { useExamStore } from "../../stores/exam";
import { RichContent } from "./RichContent";

interface Props {
  question: Question;
  questionNumber: number;
}

/** Left column item: index into config.pairs */
type LeftIdx = number;
/** Right column item: index into config.pairs */
type RightIdx = number;

/** Color palette for visualizing pairs */
const PAIR_COLORS = [
  "border-blue-400 bg-blue-50 dark:bg-blue-900/30",
  "border-green-400 bg-green-50 dark:bg-green-900/30",
  "border-purple-400 bg-purple-50 dark:bg-purple-900/30",
  "border-orange-400 bg-orange-50 dark:bg-orange-900/30",
  "border-pink-400 bg-pink-50 dark:bg-pink-900/30",
  "border-cyan-400 bg-cyan-50 dark:bg-cyan-900/30",
];

function shuffleIndices(n: number, seed: string): number[] {
  const indices = Array.from({ length: n }, (_, i) => i);
  // Deterministic shuffle based on question id so order is stable across renders.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  for (let i = n - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) | 0;
    const j = ((h >>> 0) % (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

export function MatchingQuestion({ question, questionNumber }: Props) {
  const { answers, submitAnswer } = useExamStore();
  const config = question.config as MatchingConfig;
  const pairs = config.pairs;

  // pairs[i].left matched to pairs[shuffledRight[j]].right where pairing[i] = j
  // The right column is shown in shuffled order.
  const [shuffledRight] = useState(() => shuffleIndices(pairs.length, question.id));

  // pairing: leftIdx → rightIdx (real index in pairs, not shuffled position)
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

  function getRightColorIndex(realRightIdx: RightIdx): number | null {
    const leftIdx = Object.entries(pairing).find(([, r]) => r === realRightIdx)?.[0];
    if (leftIdx === undefined) return null;
    return parseInt(leftIdx) % PAIR_COLORS.length;
  }

  async function handleLeftClick(leftIdx: LeftIdx) {
    if (selectedLeft === leftIdx) {
      setSelectedLeft(null);
      return;
    }
    setSelectedLeft(leftIdx);
    // If this left was already paired, unpair it to allow re-pairing.
  }

  async function handleRightClick(shuffledPos: number) {
    const realRightIdx = shuffledRight[shuffledPos];
    if (selectedLeft === null) {
      // Click right without selecting left: unpair whatever was paired here.
      const leftIdx = parseInt(
        Object.entries(pairing).find(([, r]) => r === realRightIdx)?.[0] ?? "-1"
      );
      if (leftIdx >= 0) {
        const newPairing = { ...pairing };
        delete newPairing[leftIdx];
        setPairing(newPairing);
        await persist(newPairing);
      }
      return;
    }
    // Complete a pairing: left → realRightIdx.
    const newPairing = { ...pairing };
    // Remove any existing pairing for this left and any existing pairing to this right.
    delete newPairing[selectedLeft];
    const prevLeft = parseInt(
      Object.entries(newPairing).find(([, r]) => r === realRightIdx)?.[0] ?? "-1"
    );
    if (prevLeft >= 0) delete newPairing[prevLeft];
    newPairing[selectedLeft] = realRightIdx;
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
    <div className="flex-1 flex flex-col gap-6 p-6 rounded-2xl border border-neutral-200/60 bg-white dark:border-neutral-800/60 dark:bg-neutral-900 shadow-sm">
      <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-neutral-800">
        <span className="text-sm font-semibold uppercase tracking-wider text-primary bg-primary/5 px-3 py-1 rounded-full">
          Pasangkan
        </span>
        <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">
          Nomor {questionNumber} dari {useExamStore.getState().questions.length}
        </span>
      </div>

      <RichContent
        html={question.text}
        className="question-html text-lg font-medium text-neutral-900 dark:text-neutral-100 leading-relaxed"
      />

      <div className="text-xs text-neutral-500 dark:text-neutral-400">
        Klik item di Kolom A, lalu klik pasangannya di Kolom B. ({pairedCount}/{pairs.length} dipasangkan)
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Left column */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Kolom A</p>
          {pairs.map((pair, leftIdx) => {
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
                    ? `${PAIR_COLORS[colorIdx]} text-neutral-800 dark:text-neutral-200`
                    : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                }`}
              >
                {pair.left}
              </button>
            );
          })}
        </div>

        {/* Right column (shuffled) */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Kolom B</p>
          {shuffledRight.map((realRightIdx, shuffledPos) => {
            const colorIdx = getRightColorIndex(realRightIdx);
            return (
              <button
                key={shuffledPos}
                type="button"
                onClick={() => handleRightClick(shuffledPos)}
                className={`rounded-xl border-2 px-3 py-2.5 text-sm text-left font-medium transition-all ${
                  colorIdx !== null
                    ? `${PAIR_COLORS[colorIdx]} text-neutral-800 dark:text-neutral-200`
                    : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-primary/30 hover:border-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                } ${selectedLeft !== null ? "cursor-pointer hover:border-primary/50" : ""}`}
              >
                {pairs[realRightIdx].right}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
