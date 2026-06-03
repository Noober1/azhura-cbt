/**
 * Azhura CBT Console — Spinner + full-area loading/empty states.
 */

interface SpinnerProps {
  className?: string;
}

export function Spinner({ className = "size-5" }: SpinnerProps) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      role="status"
      aria-label="Memuat"
    />
  );
}

interface CenterProps {
  children: React.ReactNode;
}

/** Centered block for loading / empty / error placeholders inside a panel. */
export function CenterState({ children }: CenterProps) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-sm text-faint">
      {children}
    </div>
  );
}
