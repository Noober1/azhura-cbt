/**
 * Azhura CBT Console — Visual tutorial carousel dialog (#180).
 *
 * Step-by-step visual help: each step shows a short demo animation (animated
 * WebP), a title, and a plain-Indonesian description, with a step counter and
 * Prev/Next navigation. Built on the shared <Modal/>, so Escape-to-close,
 * scrim, scroll lock, and the modal stack come for free.
 *
 * Accessibility (epic #179):
 *  - ←/→ navigate steps while the dialog is open; Escape closes (Modal).
 *  - The step counter is `aria-live` so screen readers hear progress.
 *  - Each visual uses the step title as alt text.
 *  - Animated WebP auto-plays and cannot be paused, so under
 *    `prefers-reduced-motion` we show the static poster frame instead
 *    (see `lib/help-assets.ts`); the description always tells the story in text.
 *  - When "Sebelumnya" is about to disable, focus hops to "Berikutnya" so
 *    keyboard focus never lands on a dead control.
 *
 * Visuals are lazy-loaded per step (async `?url` modules) — nothing is bundled
 * into the initial load, and a missing recording degrades to a visible
 * placeholder while the text still explains the step.
 */

import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { ChevronLeftIcon, ChevronRightIcon, ImageIcon } from "./icons";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { pickHelpImage } from "../../lib/help-assets";
import type { TutorialStep } from "../../lib/help-content";

interface TutorialCarouselDialogProps {
  open: boolean;
  /** Topic title (e.g. "Tentang Grup"), shown under the fixed dialog header. */
  topicTitle: string;
  /** Ordered tutorial steps; must be non-empty (HelpDialog guards this). */
  steps: TutorialStep[];
  onClose: () => void;
}

/**
 * Resolves the current step's visual to a served URL, lazily and
 * cancellation-safe. Returns `null` while loading or when no asset exists —
 * the carousel then shows its placeholder instead of failing silently.
 */
function useStepImage(image: string): string | null {
  const reducedMotion = usePrefersReducedMotion();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    setSrc(null);
    const load = pickHelpImage(image, reducedMotion);
    if (!load) return;

    let cancelled = false;
    load()
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        // Failed fetch of a documentation asset: keep the visible placeholder
        // (the step description still explains the action in text).
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [image, reducedMotion]);

  return src;
}

export function TutorialCarouselDialog({
  open,
  topicTitle,
  steps,
  onClose,
}: TutorialCarouselDialogProps) {
  const [index, setIndex] = useState(0);
  const nextRef = useRef<HTMLButtonElement>(null);

  const total = steps.length;
  // Tolerate an empty `steps` at the public boundary: hooks below must still
  // run unconditionally, so the bail-out happens after them.
  const step = total > 0 ? steps[Math.min(index, total - 1)] : null;
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const src = useStepImage(step?.image ?? "");

  // Every (re)open starts from step 1.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // ←/→ step navigation while open. Functional updates keep the listener
  // stable and stale-free.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Defensive: never steer the carousel while the user types in a field.
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowRight") {
        setIndex((i) => Math.min(i + 1, total - 1));
      } else if (e.key === "ArrowLeft") {
        setIndex((i) => {
          const next = Math.max(i - 1, 0);
          // Same focus hop as goPrev(): landing on step 1 disables
          // "Sebelumnya", so keyboard focus must not stay stranded on it.
          if (next === 0) nextRef.current?.focus();
          return next;
        });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, total]);

  // Public-API guard: callers should never pass empty steps (HelpDialog
  // filters), but an exported component must not crash if they do.
  if (!step) return null;

  function goPrev() {
    // "Sebelumnya" disables on step 1 — hand focus to "Berikutnya" first so
    // keyboard focus is never stranded on a disabled button.
    if (index - 1 <= 0) nextRef.current?.focus();
    setIndex((i) => Math.max(i - 1, 0));
  }

  function goNext() {
    if (isLast) {
      onClose();
      return;
    }
    setIndex((i) => Math.min(i + 1, total - 1));
  }

  return (
    <Modal
      open={open}
      title="Azhura CBT — Penggunaan"
      description={topicTitle}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <p aria-live="polite" className="mr-auto text-sm font-bold text-ink-soft">
            Langkah {index + 1} dari {total}
          </p>
          <Button
            variant="secondary"
            onClick={goPrev}
            disabled={isFirst}
            leadingIcon={<ChevronLeftIcon className="size-4" />}
          >
            Sebelumnya
          </Button>
          <Button ref={nextRef} onClick={goNext}>
            {isLast ? "Selesai" : "Berikutnya"}
            {!isLast && <ChevronRightIcon className="size-4" />}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid aspect-video place-items-center overflow-hidden rounded-[var(--radius-card)] border-2 border-[var(--nb-ink)] bg-canvas">
          {src ? (
            <img
              src={src}
              alt={step.title}
              loading="lazy"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 p-6 text-center text-faint">
              <ImageIcon className="size-8" />
              <p className="text-sm font-medium">
                Peraga visual belum tersedia. Ikuti penjelasan di bawah ini.
              </p>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-base font-extrabold tracking-tight text-ink">{step.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.description}</p>
        </div>
      </div>
    </Modal>
  );
}
