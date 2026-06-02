import { useEffect, useRef } from "react";
import { useExamStore } from "../stores/exam";
import { toast } from "sonner";

/**
 * Custom React Hook that drives the exam timer countdown.
 * It decrements the remaining time every second, warns when time is low (< 5 minutes),
 * and automatically triggers final exam submission when the timer expires.
 */
export const useExamTimer = () => {
  const { timeRemaining, setTimeRemaining, submitExam, examSessionId } = useExamStore();
  const warnedRef = useRef(false);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    // Only run timer if there is an active exam session
    if (!examSessionId || timeRemaining <= 0) return;

    warnedRef.current = false;
    autoSubmittedRef.current = false;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        const nextTime = prev - 1;

        // 1. Low time warning (< 5 minutes / 300 seconds)
        if (nextTime <= 300 && nextTime > 0 && !warnedRef.current) {
          warnedRef.current = true;
          toast.warning("Peringatan: Waktu pengerjaan tinggal kurang dari 5 menit!", {
            duration: 8000,
          });
        }

        // 2. Timer expired
        if (nextTime <= 0) {
          clearInterval(interval);
          if (!autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            toast.error("Waktu Ujian Habis! Jawaban Anda sedang dikumpulkan otomatis...");
            // Execute force submit
            submitExam().then(() => {
              window.location.hash = "/result";
            });
          }
          return 0;
        }

        return nextTime;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [examSessionId, setTimeRemaining, submitExam]);

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
    isLowTime: timeRemaining <= 300 && timeRemaining > 0,
  };
};
