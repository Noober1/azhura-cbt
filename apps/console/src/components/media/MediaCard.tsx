/**
 * Azhura CBT Console — MediaCard (#87).
 *
 * Grid tile for images (thumbnail) or list item for audio/video (icon + name).
 * Clicking opens the preview modal.
 */

import type { MediaFile, MediaType } from "../../types";
import { formatBytes, resolveMediaUrl } from "../../lib/format";
import { ImageIcon, AudioIcon, VideoIcon } from "../ui/icons";

interface MediaCardProps {
  item: MediaFile;
  onClick: () => void;
}

function TypeIcon({ type, className }: { type: MediaType; className?: string }) {
  if (type === "image") return <ImageIcon className={className ?? "size-6 text-blue-400"} />;
  if (type === "audio") return <AudioIcon className={className ?? "size-6 text-green-400"} />;
  return <VideoIcon className={className ?? "size-6 text-purple-400"} />;
}

export function MediaCard({ item, onClick }: MediaCardProps) {
  if (item.type === "image") {
    return (
      <button
        onClick={onClick}
        className="focus-ring group relative aspect-square overflow-hidden rounded-lg border border-line bg-canvas transition-shadow hover:shadow-md hover:shadow-ink/8"
      >
        <img
          src={resolveMediaUrl(item.url)}
          alt={item.originalName}
          className="size-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/60 to-transparent px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <p className="truncate text-[0.6875rem] text-white">{item.originalName}</p>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="focus-ring flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:bg-canvas"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-canvas">
        <TypeIcon type={item.type} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{item.originalName}</p>
        <p className="mt-0.5 text-xs text-faint">{formatBytes(item.sizeBytes)}</p>
      </div>
    </button>
  );
}
