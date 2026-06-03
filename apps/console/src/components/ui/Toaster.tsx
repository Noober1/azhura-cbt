/**
 * Azhura CBT Console — Toaster (renders the toast store).
 */

import { useToastStore, type ToastTone } from "../../stores/toast";
import { CheckIcon, AlertIcon, XIcon } from "./icons";

const TONE_STYLES: Record<ToastTone, string> = {
  success: "border-positive/30 bg-positive-wash text-positive",
  error: "border-danger/30 bg-danger-wash text-danger",
  info: "border-accent/30 bg-accent-wash text-accent-strong",
};

function ToneIcon({ tone }: { tone: ToastTone }) {
  if (tone === "success") return <CheckIcon className="size-4 shrink-0" />;
  return <AlertIcon className="size-4 shrink-0" />;
}

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2.5 rounded-[var(--radius-field)] border px-3.5 py-3 text-sm shadow-lg shadow-ink/5 ${TONE_STYLES[t.tone]}`}
        >
          <ToneIcon tone={t.tone} />
          <span className="flex-1 leading-snug text-ink">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Tutup notifikasi"
            className="focus-ring -mr-1 rounded p-0.5 text-faint hover:text-ink"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
