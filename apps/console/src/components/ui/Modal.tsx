/**
 * Azhura CBT Console — Modal dialog.
 *
 * Lightweight, dependency-free dialog: scrim + centered panel, Escape to close,
 * body-scroll lock, and an accessible labelled header. Footer/content are passed
 * as children so each caller owns its form.
 *
 * Nested modals (e.g. a help dialog opened over an import dialog) share an
 * open-modal stack so only the TOPMOST one responds to Escape, and body scroll
 * is unlocked only when the last modal closes. This prevents Escape from closing
 * an underlying modal and stops a closing child from prematurely restoring
 * scroll on its still-open parent.
 */

import { useEffect, useId, useRef, type ReactNode } from "react";
import { XIcon } from "./icons";
import { Tooltip } from "./Tooltip";

/** Ordered stack of currently-open modal ids; the last entry is on top. */
const openModalStack: string[] = [];

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional sticky footer (actions). */
  footer?: ReactNode;
  /** Optional header control rendered just before the X close button (e.g. a help button). */
  headerAction?: ReactNode;
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
  headerAction,
  size = "md",
}: ModalProps) {
  const modalId = useId();
  // Keep the latest onClose without making it an effect dependency. Consumers
  // pass an inline arrow, so depending on it would re-run the effect on every
  // parent render — corrupting the open-modal stack order and closing the wrong
  // (parent) modal on Escape when a nested modal is open.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    openModalStack.push(modalId);
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      // Only the topmost modal reacts, so Escape never closes an underlying one.
      if (e.key === "Escape" && openModalStack[openModalStack.length - 1] === modalId) {
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      const i = openModalStack.lastIndexOf(modalId);
      if (i !== -1) openModalStack.splice(i, 1);
      // Restore scroll only once the last open modal has closed.
      if (openModalStack.length === 0) document.body.style.overflow = "";
    };
  }, [open, modalId]);

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
          <div className="flex shrink-0 items-center gap-1.5">
            {headerAction}
            <Tooltip label="Tutup" className="-mr-1 inline-flex">
              <button
                onClick={onClose}
                aria-label="Tutup"
                className="focus-ring rounded-md border-2 border-[var(--nb-ink)] bg-surface p-1 text-ink transition-colors hover:bg-canvas"
              >
                <XIcon className="size-5" />
              </button>
            </Tooltip>
          </div>
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
