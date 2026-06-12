import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { AlignLeftIcon, AlignCenterIcon, AlignRightIcon, TrashIcon } from "../ui/icons";
import { Tooltip } from "../ui/Tooltip";
import { resolveMediaUrl } from "../../lib/format";

interface MediaAttrs {
  src: string;
  mediaType: "image" | "audio" | "video";
  alt: string;
  width: string | null;
  align: "left" | "center" | "right";
}

const ALIGN_OPTIONS: { value: MediaAttrs["align"]; title: string; icon: React.ReactNode }[] = [
  { value: "left",   title: "Rata kiri",  icon: <AlignLeftIcon   className="size-3.5" /> },
  { value: "center", title: "Tengah",     icon: <AlignCenterIcon className="size-3.5" /> },
  { value: "right",  title: "Rata kanan", icon: <AlignRightIcon  className="size-3.5" /> },
];

const WIDTH_PRESETS: { label: string; value: string | null }[] = [
  { label: "Auto", value: null },
  { label: "25%",  value: "25%" },
  { label: "50%",  value: "50%" },
  { label: "75%",  value: "75%" },
  { label: "100%", value: "100%" },
];

export function MediaEmbedView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { src, mediaType, alt, width, align } = node.attrs as MediaAttrs;

  // Node attrs store the RELATIVE `/uploads/...` path; the in-editor preview
  // needs an absolute URL because the console runs on a different origin than
  // the backend that serves uploads.
  const displaySrc = resolveMediaUrl(src);

  const isAudio = mediaType === "audio";
  const isVideo = mediaType === "video";

  const containerStyle: React.CSSProperties = {
    textAlign: isAudio ? "left" : (align ?? "center"),
  };

  const mediaStyle: React.CSSProperties = isVideo
    ? { width: width ?? "100%", maxWidth: "100%", aspectRatio: "16/9", display: "block" }
    : { width: isAudio ? undefined : (width ?? "auto"), maxWidth: "100%", display: "inline-block" };

  return (
    <NodeViewWrapper
      className={`media-embed-node relative my-2 rounded-sm${selected ? " ring-2 ring-accent/50" : ""}`}
      style={{ userSelect: "none" } as React.CSSProperties}
    >
      {/* Media */}
      <div style={containerStyle}>
        {mediaType === "image" && (
          <img src={displaySrc} alt={alt ?? ""} style={mediaStyle} draggable={false} />
        )}
        {mediaType === "audio" && (
          <audio src={displaySrc} controls style={{ display: "inline-block" }} />
        )}
        {mediaType === "video" && (
          <video src={displaySrc} controls style={mediaStyle} />
        )}
      </div>

      {/* Inline toolbar — shown when node is selected */}
      {selected && (
        <div
          contentEditable={false}
          className="mt-1.5 flex items-center justify-center gap-1"
        >
          <div className="flex items-center gap-0.5 rounded-md border border-line bg-surface px-1.5 py-1 shadow-sm">
            {/* Alignment + width presets — hidden for audio */}
            {!isAudio && (
              <>
                {ALIGN_OPTIONS.map((opt) => (
                  <Tooltip key={opt.value} label={opt.title}>
                    <button
                      type="button"
                      aria-label={opt.title}
                      onClick={() => updateAttributes({ align: opt.value })}
                      className={`focus-ring inline-flex size-6 items-center justify-center rounded transition-colors ${
                        (align ?? "center") === opt.value
                          ? "bg-accent/15 text-accent"
                          : "text-ink-soft hover:bg-canvas hover:text-ink"
                      }`}
                    >
                      {opt.icon}
                    </button>
                  </Tooltip>
                ))}

                <span className="mx-1 h-4 w-px bg-line" />

                {WIDTH_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    title={`Lebar ${preset.label}`}
                    onClick={() => updateAttributes({ width: preset.value })}
                    className={`focus-ring rounded px-1.5 py-0.5 text-[0.625rem] font-medium transition-colors ${
                      (width ?? null) === preset.value
                        ? "bg-accent/15 text-accent"
                        : "text-ink-soft hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}

                <span className="mx-1 h-4 w-px bg-line" />
              </>
            )}

            {/* Delete */}
            <Tooltip label="Hapus media">
              <button
                type="button"
                aria-label="Hapus media"
                onClick={() => deleteNode()}
                className="focus-ring inline-flex size-6 items-center justify-center rounded text-faint transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <TrashIcon className="size-3.5" />
              </button>
            </Tooltip>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}
