import { useExamTimer } from "../../hooks/useExamTimer";

/**
 * Header widget that shows the live exam countdown (HH:MM:SS) driven by
 * {@link useExamTimer}, switching to a pulsing destructive style when time is low.
 */
export const TimerDisplay = () => {
  const { formattedTime, isLowTime } = useExamTimer();

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-lg font-bold transition-all duration-300 ${
        isLowTime
          ? "bg-destructive/10 text-destructive border-destructive animate-pulse"
          : "bg-neutral-100 text-neutral-900 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-50 dark:border-neutral-700"
      }`}
    >
      {/* Clock Icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        className={`w-5 h-5 ${isLowTime ? "text-destructive" : "text-neutral-500 dark:text-neutral-400"}`}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>

      {/* Timer Value */}
      <span>{formattedTime}</span>
    </div>
  );
};
