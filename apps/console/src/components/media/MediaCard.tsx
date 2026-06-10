import type { MediaFile, MediaType } from "../../types";
import { formatBytes, resolveMediaUrl } from "../../lib/format";
import { AudioIcon, VideoIcon, CheckIcon } from "../ui/icons";

interface MediaCardProps {
  item: MediaFile;
  onClick: () => void;
  selected?: boolean;
  selectionMode?: boolean;
  onToggleSelect?: (id: string) => void;
}

const TYPE_STYLES: Record<MediaType, { bg: string; icon: React.ReactNode }> = {
  image: { bg: "", icon: null },
  audio: { bg: "bg-green-500/10", icon: <AudioIcon className="size-10 text-green-400" /> },
  video: { bg: "bg-purple-500/10", icon: <VideoIcon className="size-10 text-purple-400" /> },
};

function Checkbox({ selected, selectionMode, onToggle }: { selected: boolean; selectionMode: boolean; onToggle: (e: React.MouseEvent) => void }) {
  return (
    <span
      onClick={onToggle}
      className={`absolute left-2 top-2 z-10 flex size-5 items-center justify-center rounded-full border-2 transition-all ${
        selected
          ? "border-accent bg-accent"
          : "border-white/80 bg-ink/20 opacity-0 group-hover:opacity-100"
      } ${selectionMode ? "opacity-100" : ""}`}
    >
      {selected && <CheckIcon className="size-3 text-white" />}
    </span>
  );
}

export function MediaCard({ item, onClick, selected = false, selectionMode = false, onToggleSelect }: MediaCardProps) {
  function handleClick() {
    if (selectionMode) onToggleSelect?.(item.id);
    else onClick();
  }

  function handleCheckbox(e: React.MouseEvent) {
    e.stopPropagation();
    onToggleSelect?.(item.id);
  }

  if (item.type === "image") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`focus-ring group relative block w-full aspect-square overflow-hidden rounded-lg border-2 transition-shadow hover:shadow-[3px_3px_0_var(--nb-ink)] ${selected ? "border-[var(--nb-ink)] bg-accent-wash shadow-[3px_3px_0_var(--nb-ink)]" : "border-[var(--nb-ink)] bg-canvas"}`}
      >
        {onToggleSelect && <Checkbox selected={selected} selectionMode={selectionMode} onToggle={handleCheckbox} />}
        <img
          src={resolveMediaUrl(item.url)}
          alt={item.originalName}
          className="size-full object-cover transition-transform group-hover:scale-105"
        />
        <div className="absolute inset-x-0 bottom-0 bg-ink/70 px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <p className="truncate text-[0.6875rem] text-white">{item.originalName}</p>
        </div>
      </button>
    );
  }

  const { bg, icon } = TYPE_STYLES[item.type];
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`focus-ring group relative flex w-full aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border-2 transition-shadow hover:shadow-[3px_3px_0_var(--nb-ink)] ${selected ? "border-[var(--nb-ink)] bg-accent-wash shadow-[3px_3px_0_var(--nb-ink)]" : `border-[var(--nb-ink)] ${bg}`}`}
    >
      {onToggleSelect && <Checkbox selected={selected} selectionMode={selectionMode} onToggle={handleCheckbox} />}
      {icon}
      <div className="absolute inset-x-0 bottom-0 px-2 py-1.5">
        <p className="truncate text-center text-[0.6875rem] text-ink-soft">{item.originalName}</p>
        <p className="text-center text-[0.625rem] text-faint">{formatBytes(item.sizeBytes)}</p>
      </div>
    </button>
  );
}
