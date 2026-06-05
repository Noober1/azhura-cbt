import { useEffect, useRef } from "react";
import { useExamStore } from "../stores/exam";
import { toast } from "sonner";

/** Low-time warning threshold, in seconds (< 5 minutes). */
const LOW_TIME_THRESHOLD_SECONDS = 300;

/**
 * Drives the exam timer countdown (#8).
 *
 * The remaining time is derived from the authoritative `endTime` against a
 * clock-skew-corrected wall clock (`endTime − (Date.now() + serverTimeOffset)`),
 * recomputed every tick rather than decremented. This makes the countdown:
 * - **offline-tolerant** — it keeps ticking with no server, and a reconnect never
 *   resets it (the client clock is the source of truth);
 * - **drift-proof** — a throttled/background tab that misses ticks still shows the
 *   true remaining time on its next tick;
 * - **skew-aware** — a wrong local clock is corrected by the captured offset.
 *
 * When time runs out it funnels into {@link finalizeExam} (Processing lock +
 * infinite retry), never a single fire-and-forget submit.
 */
export const useExamTimer = () => {
  const { timeRemaining, endTime, serverTimeOffset, setTimeRemaining, finalizeExam, examSessionId } =
    useExamStore();
  const warnedRef = useRef(false);
  const finalizedRef = useRef(false);

  useEffect(() => {
    if (!examSessionId || !endTime) return;

    // Reset per-session guards. The effect re-runs when `endTime` changes (e.g. a
    // supervisor time change, #8), which correctly re-arms the warning and lets a
    // session that gained time leave the expired state.
    warnedRef.current = false;
    finalizedRef.current = false;

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((endTime - (Date.now() + serverTimeOffset)) / 1000)
      );
      setTimeRemaining(remaining);

      // 1. Low-time warning (once per session, < 5 minutes left).
      if (
        remaining <= LOW_TIME_THRESHOLD_SECONDS &&
        remaining > 0 &&
        !warnedRef.current
      ) {
        warnedRef.current = true;
        toast.warning("Peringatan: Waktu pengerjaan tinggal kurang dari 5 menit!", {
          duration: 8000,
        });
      }

      // 2. Time expired — finalize exactly once. finalizeExam owns the Processing
      // lock and retries until the server accepts; navigation to the result page
      // is driven by ExamLayout reacting to `examResult`, not from here.
      if (remaining <= 0 && !finalizedRef.current) {
        finalizedRef.current = true;
        toast.error("Waktu Ujian Habis! Jawaban Anda sedang dikumpulkan otomatis...");
        void finalizeExam();
      }
    };

    tick(); // immediate sync so the display is correct before the first interval
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [examSessionId, endTime, serverTimeOffset, setTimeRemaining, finalizeExam]);

  // Format remaining seconds into HH:MM:SS format
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const pad = (num: number) => String(num).padStart(2, "0");
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  };

  return {
    timeRemaining,
    formattedTime: formatTime(timeRemaining),
    isLowTime: timeRemaining <= LOW_TIME_THRESHOLD_SECONDS && timeRemaining > 0,
  };
};
