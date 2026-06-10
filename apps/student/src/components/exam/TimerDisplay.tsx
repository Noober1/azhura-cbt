import { useExamTimer } from "../../hooks/useExamTimer";

/**
 * Header widget that shows the live exam countdown (HH:MM:SS) driven by
 * {@link useExamTimer}, switching to a pulsing destructive style when time is low.
 */
export const TimerDisplay = () => {
  const { formattedTime, isLowTime } = useExamTimer();

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 rounded-xl border-[2.5px] border-[var(--nb-ink)] font-mono text-lg font-bold tabular-nums shadow-[2px_2px_0_var(--nb-ink)] transition-colors duration-300 ${
        isLowTime
          ? "bg-destructive text-white animate-pulse"
          : "bg-amber text-foreground"
      }`}
    >
      {/* Clock Icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        className="w-5 h-5 text-current"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>

      {/* Timer Value */}
      <span>{formattedTime}</span>
    </div>
  );
};
