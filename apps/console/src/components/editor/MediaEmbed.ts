import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MediaEmbedView } from "./MediaEmbedView";
import { relativizeMediaUrl } from "../../lib/format";

/** Parses the `data-max-plays` attribute into a positive int, or null (unlimited). */
function parseMaxPlays(el: HTMLElement): number | null {
  const raw = el.getAttribute("data-max-plays");
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** A `data-no-seek` attribute that is present and not "false" means seek is locked. */
function parseNoSeek(el: HTMLElement): boolean {
  const raw = el.getAttribute("data-no-seek");
  return raw !== null && raw !== "false";
}

export const MediaEmbed = Node.create({
  name: "mediaEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src:       { default: null },
      mediaType: { default: "image" },
      alt:       { default: "" },
      width:     { default: null },             // null = auto | "25%" | "50%" | "75%" | "100%"
      align:     { default: "center" },         // "left" | "center" | "right"
      // Exam-integrity controls (#164) — audio/video only. Enforced by the
      // student client's custom player; persisted as `data-*` on the tag so they
      // survive the HTML round-trip without any schema/backend change.
      maxPlays:  { default: null },             // null = unlimited | positive int = play-count cap
      noSeek:    { default: false },            // true = timeline locked (no scrubbing)
    };
  },

  parseHTML() {
    return [
      {
        tag: "img[data-tiptap-media]",
        getAttrs: (el) => {
          const e = el as HTMLImageElement;
          const raw = e.getAttribute("src");
          return {
            // Re-relativize legacy stems saved with an absolute self-origin URL
            // so a re-save passes the server-side `^/uploads/` guard. External
            // URLs stay absolute (and are rejected on save — by design).
            src:       raw === null ? null : relativizeMediaUrl(raw),
            mediaType: "image",
            alt:       e.getAttribute("alt") ?? "",
            width:     e.getAttribute("data-width"),
            align:     e.getAttribute("data-align") ?? "center",
          };
        },
      },
      {
        tag: "audio[data-tiptap-media]",
        getAttrs: (el) => {
          const e = el as HTMLAudioElement;
          const raw = e.getAttribute("src");
          return {
          src:       raw === null ? null : relativizeMediaUrl(raw),
          mediaType: "audio",
          alt:       "",
          width:     null,
          align:     e.getAttribute("data-align") ?? "center",
          maxPlays:  parseMaxPlays(e),
          noSeek:    parseNoSeek(e),
          };
        },
      },
      {
        tag: "video[data-tiptap-media]",
        getAttrs: (el) => {
          const e = el as HTMLVideoElement;
          const raw = e.getAttribute("src");
          return {
            src:       raw === null ? null : relativizeMediaUrl(raw),
            mediaType: "video",
            alt:       "",
            width:     e.getAttribute("data-width"),
            align:     e.getAttribute("data-align") ?? "center",
            maxPlays:  parseMaxPlays(e),
            noSeek:    parseNoSeek(e),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, mediaType, alt, width, align, maxPlays, noSeek } = HTMLAttributes;

    const shared: Record<string, string> = { "data-tiptap-media": "" };
    if (align && align !== "center") shared["data-align"] = align;
    if (width) shared["data-width"] = width;
    const style = width ? `width:${width};max-width:100%` : undefined;

    // Integrity attributes (#164) — only meaningful for audio/video.
    const integrity: Record<string, string> = {};
    if (typeof maxPlays === "number" && maxPlays > 0) integrity["data-max-plays"] = String(maxPlays);
    if (noSeek) integrity["data-no-seek"] = "";

    if (mediaType === "audio") {
      return ["audio", mergeAttributes(shared, integrity, { src, controls: "" })];
    }
    if (mediaType === "video") {
      return ["video", mergeAttributes(shared, integrity, { src, controls: "", ...(style && { style }) })];
    }
    return ["img", mergeAttributes(shared, { src, alt, ...(style && { style }) })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaEmbedView);
  },
});
