import type { MediaFile, MediaType } from "../../types";
import { formatBytes, resolveMediaUrl } from "../../lib/format";
import { AudioIcon, VideoIcon } from "../ui/icons";

interface MediaCardProps {
  item: MediaFile;
  onClick: () => void;
}

const TYPE_STYLES: Record<MediaType, { bg: string; icon: React.ReactNode }> = {
  image: { bg: "", icon: null },
  audio: { bg: "bg-green-500/10", icon: <AudioIcon className="size-10 text-green-400" /> },
  video: { bg: "bg-purple-500/10", icon: <VideoIcon className="size-10 text-purple-400" /> },
};

export function MediaCard({ item, onClick }: MediaCardProps) {
  if (item.type === "image") {
    return (
      <button
        onClick={onClick}
        className="focus-ring group relative block w-full aspect-square overflow-hidden rounded-lg border border-line bg-canvas transition-shadow hover:shadow-md hover:shadow-ink/8"
      >
        <img
          src={resolveMediaUrl(item.url)}
          alt={item.originalName}
          className="size-full object-cover transition-transform group-hover:scale-105"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/60 to-transparent px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <p className="truncate text-[0.6875rem] text-white">{item.originalName}</p>
        </div>
      </button>
    );
  }

  const { bg, icon } = TYPE_STYLES[item.type];
  return (
    <button
      onClick={onClick}
      className={`focus-ring group relative flex w-full aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-line transition-shadow hover:shadow-md hover:shadow-ink/8 ${bg}`}
    >
      {icon}
      <div className="absolute inset-x-0 bottom-0 px-2 py-1.5">
        <p className="truncate text-center text-[0.6875rem] text-ink-soft">{item.originalName}</p>
        <p className="text-center text-[0.625rem] text-faint">{formatBytes(item.sizeBytes)}</p>
      </div>
    </button>
  );
}
