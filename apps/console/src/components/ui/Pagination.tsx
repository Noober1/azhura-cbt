import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/** Build a windowed page list with ellipsis: [1, …, 19, 20, 21, …, 42] */
function buildPages(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "…")[] = [];

  const addRange = (from: number, to: number) => {
    for (let i = from; i <= to; i++) pages.push(i);
  };

  pages.push(1);

  if (current <= 4) {
    addRange(2, Math.min(5, total - 1));
    if (total > 6) pages.push("…");
  } else if (current >= total - 3) {
    pages.push("…");
    addRange(Math.max(total - 4, 2), total - 1);
  } else {
    pages.push("…");
    addRange(current - 1, current + 1);
    pages.push("…");
  }

  pages.push(total);
  return pages;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  const pages = buildPages(page, totalPages);

  const btnBase =
    "focus-ring inline-flex h-8 min-w-8 items-center justify-center rounded-md border-2 border-[var(--nb-ink)] bg-surface px-2 text-sm font-bold text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:bg-canvas";
  const btnActive =
    "focus-ring inline-flex h-8 min-w-8 items-center justify-center rounded-md border-2 border-[var(--nb-ink)] bg-accent px-2 text-sm font-bold text-white shadow-[2px_2px_0_var(--nb-ink)]";

  return (
    <div className="flex items-center justify-center gap-1.5 border-t-2 border-line-soft pt-4">
      <button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Halaman sebelumnya"
        className={btnBase}
      >
        <ChevronLeftIcon className="size-4" />
      </button>

      {pages.map((p, i) =>
        p === "…" ? (
          <span
            key={`ellipsis-${i}`}
            className="inline-flex h-8 min-w-8 items-center justify-center text-sm text-faint"
            aria-hidden
          >
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            aria-label={`Halaman ${p}`}
            aria-current={p === page ? "page" : undefined}
            className={p === page ? btnActive : btnBase}
          >
            {p}
          </button>
        )
      )}

      <button
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Halaman berikutnya"
        className={btnBase}
      >
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  );
}
