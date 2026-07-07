/**
 * Answer merge for final exam submission.
 *
 * The final `POST /submit` used to upsert every question straight from the
 * client payload, writing NULL for any question the client omitted. Combined
 * with a client that lost its in-memory answers (e.g. a mid-exam refresh),
 * that wiped answers already autosaved to the server and scored the student 0.
 *
 * These pure helpers make the submit path *merge* instead of *overwrite*: a
 * question the client omits (or sends empty) keeps whatever is already stored
 * on the server. Only a fresh, non-empty client answer is persisted.
 */

export interface StoredAnswer {
  selectedOptionId: string | null;
  answerValue: string | null;
}

export interface SubmittedAnswer {
  questionId: string;
  selectedOptionId?: string | null;
  answerValue?: string | null;
  timestamp?: number;
  isFlagged?: boolean;
}

/** An answer is "empty" when it carries neither a selected option nor a value. */
export function isEmptyAnswer(
  a: { selectedOptionId?: string | null; answerValue?: string | null } | undefined | null
): boolean {
  return !a || (!a.selectedOptionId && !a.answerValue);
}

export interface MergedAnswer {
  /** Answer used for grading (client value if fresh, else the stored value). */
  effective: StoredAnswer;
  /** The client-supplied answer to persist, or null when nothing fresh was sent. */
  toPersist: SubmittedAnswer | null;
}

/**
 * Decide, for one question, what to grade and what to persist.
 * - Fresh non-empty client answer  → grade it and persist it.
 * - Client omitted / sent empty    → grade the stored answer, persist nothing
 *                                    (so an autosaved answer is never nulled).
 */
export function mergeAnswer(
  submitted: SubmittedAnswer | undefined,
  stored: StoredAnswer | undefined
): MergedAnswer {
  const storedEffective: StoredAnswer = {
    selectedOptionId: stored?.selectedOptionId ?? null,
    answerValue: stored?.answerValue ?? null,
  };

  if (isEmptyAnswer(submitted)) {
    return { effective: storedEffective, toPersist: null };
  }

  return {
    effective: {
      selectedOptionId: submitted!.selectedOptionId ?? null,
      answerValue: submitted!.answerValue ?? null,
    },
    toPersist: submitted!,
  };
}
