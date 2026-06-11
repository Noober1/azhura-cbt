import { useState, useRef, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
  /**
   * Classes for the inline wrapper that anchors the tooltip. Defaults to
   * `relative inline-flex`. Override when the wrapped control needs different
   * positioning (e.g. a `fixed` floating action button) so the tooltip is
   * measured against the right box.
   */
  className?: string;
}

/**
 * Tooltip that renders into document.body via a portal so it escapes any
 * ancestor `overflow: hidden` container (e.g. the table card wrapper).
 * Shows after a 300ms delay to avoid flicker on fast cursor passes.
 *
 * Shows on both pointer hover and keyboard focus, so every consumer is
 * keyboard-accessible without extra wiring.
 */
export function Tooltip({ label, children, side = "top", className = "relative inline-flex" }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const OFFSET = 6;
    setCoords({
      top: side === "top" ? rect.top - OFFSET : rect.bottom + OFFSET,
      left: rect.left + rect.width / 2,
    });
    timerRef.current = setTimeout(() => setVisible(true), 300);
  }, [side]);

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={className}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              transform:
                side === "top" ? "translate(-50%, -100%)" : "translateX(-50%)",
              zIndex: 9999,
            }}
            className="pointer-events-none whitespace-nowrap rounded px-2 py-1 text-xs font-medium bg-ink text-white shadow-sm"
          >
            {label}
          </span>,
          document.body
        )}
    </div>
  );
}
