import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { AlignLeftIcon, AlignCenterIcon, AlignRightIcon } from "../ui/icons";

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

export function MediaEmbedView({ node, updateAttributes, selected }: NodeViewProps) {
  const { src, mediaType, alt, width, align } = node.attrs as MediaAttrs;

  const containerStyle: React.CSSProperties = {
    textAlign: align ?? "center",
  };

  const mediaStyle: React.CSSProperties = {
    width: width ?? "auto",
    maxWidth: "100%",
    display: "inline-block",
  };

  return (
    <NodeViewWrapper
      className={`media-embed-node relative my-2 rounded-sm${selected ? " ring-2 ring-accent/50" : ""}`}
      style={{ userSelect: "none" } as React.CSSProperties}
    >
      {/* Media */}
      <div style={containerStyle}>
        {mediaType === "image" && (
          <img src={src} alt={alt ?? ""} style={mediaStyle} draggable={false} />
        )}
        {mediaType === "audio" && (
          <audio src={src} controls style={{ display: "inline-block" }} />
        )}
        {mediaType === "video" && (
          <video src={src} controls style={mediaStyle} />
        )}
      </div>

      {/* Inline toolbar — shown when node is selected */}
      {selected && (
        <div
          contentEditable={false}
          className="mt-1.5 flex items-center justify-center gap-1"
        >
          <div className="flex items-center gap-0.5 rounded-md border border-line bg-surface px-1.5 py-1 shadow-sm">
            {/* Alignment */}
            {ALIGN_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={opt.title}
                onClick={() => updateAttributes({ align: opt.value })}
                className={`focus-ring inline-flex size-6 items-center justify-center rounded transition-colors ${
                  (align ?? "center") === opt.value
                    ? "bg-accent/15 text-accent"
                    : "text-ink-soft hover:bg-canvas hover:text-ink"
                }`}
              >
                {opt.icon}
              </button>
            ))}

            <span className="mx-1 h-4 w-px bg-line" />

            {/* Width presets */}
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
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}
