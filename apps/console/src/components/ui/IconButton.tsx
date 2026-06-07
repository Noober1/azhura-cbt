import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Tooltip } from "./Tooltip";

type Variant = "default" | "danger";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  variant?: Variant;
  tooltipSide?: "top" | "bottom";
}

const VARIANTS: Record<Variant, string> = {
  default: "text-faint hover:bg-canvas hover:text-ink",
  danger: "text-faint hover:bg-danger-wash hover:text-danger",
};

export function IconButton({
  icon,
  label,
  variant = "default",
  tooltipSide = "top",
  className = "",
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip label={label} side={tooltipSide}>
      <button
        aria-label={label}
        className={`focus-ring rounded-md p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${className}`}
        {...rest}
      >
        {icon}
      </button>
    </Tooltip>
  );
}
