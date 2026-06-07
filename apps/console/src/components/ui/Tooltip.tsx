import type { ReactNode } from "react";

interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
}

export function Tooltip({ label, children, side = "top" }: TooltipProps) {
  return (
    <div className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={[
          "pointer-events-none absolute z-50 whitespace-nowrap rounded px-2 py-1 text-xs font-medium",
          "bg-ink text-white opacity-0 shadow-sm",
          "transition-opacity delay-300 duration-150 group-hover:opacity-100",
          side === "top"
            ? "bottom-full left-1/2 mb-1.5 -translate-x-1/2"
            : "left-1/2 top-full mt-1.5 -translate-x-1/2",
        ].join(" ")}
      >
        {label}
      </span>
    </div>
  );
}
