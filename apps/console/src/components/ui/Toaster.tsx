/**
 * Azhura CBT Console — Toaster (renders the toast store).
 */

import { useToastStore, type ToastTone } from "../../stores/toast";
import { CheckIcon, AlertIcon, XIcon } from "./icons";

/* Yellow toast block (neobrutalist) — tone only swaps the leading icon colour. */
const TONE_STYLES: Record<ToastTone, string> = {
  success: "text-positive",
  error: "text-danger",
  info: "text-accent-strong",
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
          className={`pointer-events-auto flex items-start gap-2.5 rounded-[var(--radius-field)] border-[2.5px] border-[var(--nb-ink)] bg-highlight px-3.5 py-3 text-sm shadow-[5px_5px_0_var(--nb-ink)] ${TONE_STYLES[t.tone]}`}
        >
          <ToneIcon tone={t.tone} />
          <span className="flex-1 font-medium leading-snug text-ink">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Tutup notifikasi"
            className="focus-ring -mr-1 rounded p-0.5 text-ink-soft hover:text-ink"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
