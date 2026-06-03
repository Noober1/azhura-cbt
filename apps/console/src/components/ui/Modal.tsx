/**
 * Azhura CBT Console — Modal dialog.
 *
 * Lightweight, dependency-free dialog: scrim + centered panel, Escape to close,
 * body-scroll lock, and an accessible labelled header. Footer/content are passed
 * as children so each caller owns its form.
 */

import { useEffect, type ReactNode } from "react";
import { XIcon } from "./icons";

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
        className="fixed inset-0 bg-ink/35 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 my-6 w-full ${SIZES[size]} overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-2xl shadow-ink/10`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-faint">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="focus-ring -mr-1 rounded-md p-1 text-faint transition-colors hover:bg-canvas hover:text-ink"
          >
            <XIcon className="size-5" />
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
