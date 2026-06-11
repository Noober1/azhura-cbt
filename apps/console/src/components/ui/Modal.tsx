/**
 * Azhura CBT Console — Modal dialog.
 *
 * Lightweight, dependency-free dialog: scrim + centered panel, Escape to close,
 * body-scroll lock, and an accessible labelled header. Footer/content are passed
 * as children so each caller owns its form.
 */

import { useEffect, type ReactNode } from "react";
import { XIcon } from "./icons";
import { Tooltip } from "./Tooltip";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional sticky footer (actions). */
  footer?: ReactNode;
  /** Tailwind max-width class for the panel. */
  size?: "md" | "lg";
}

const SIZES = { md: "max-w-lg", lg: "max-w-2xl" } as const;

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-[rgba(21,19,15,0.55)]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 my-6 w-full ${SIZES[size]} overflow-hidden rounded-[var(--radius-card)] border-[3px] border-[var(--nb-ink)] bg-surface shadow-[8px_8px_0_var(--nb-ink)]`}
      >
        {/* Yellow header band — the neobrutalist modal signature. */}
        <header className="flex items-start justify-between gap-4 border-b-[2.5px] border-[var(--nb-ink)] bg-highlight px-5 py-4">
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm font-medium text-ink-soft">{description}</p>}
          </div>
          <Tooltip label="Tutup" className="-mr-1 inline-flex">
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="focus-ring rounded-md border-2 border-[var(--nb-ink)] bg-surface p-1 text-ink transition-colors hover:bg-canvas"
            >
              <XIcon className="size-5" />
            </button>
          </Tooltip>
        </header>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t-[2.5px] border-[var(--nb-ink)] bg-canvas px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
