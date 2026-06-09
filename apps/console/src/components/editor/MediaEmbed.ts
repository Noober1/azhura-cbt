import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MediaEmbedView } from "./MediaEmbedView";

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
    };
  },

  parseHTML() {
    return [
      {
        tag: "img[data-tiptap-media]",
        getAttrs: (el) => {
          const e = el as HTMLImageElement;
          return {
            src:       e.getAttribute("src"),
            mediaType: "image",
            alt:       e.getAttribute("alt") ?? "",
            width:     e.getAttribute("data-width"),
            align:     e.getAttribute("data-align") ?? "center",
          };
        },
      },
      {
        tag: "audio[data-tiptap-media]",
        getAttrs: (el) => ({
          src:       (el as HTMLAudioElement).getAttribute("src"),
          mediaType: "audio",
          alt:       "",
          width:     null,
          align:     (el as HTMLElement).getAttribute("data-align") ?? "center",
        }),
      },
      {
        tag: "video[data-tiptap-media]",
        getAttrs: (el) => {
          const e = el as HTMLVideoElement;
          return {
            src:       e.getAttribute("src"),
            mediaType: "video",
            alt:       "",
            width:     e.getAttribute("data-width"),
            align:     e.getAttribute("data-align") ?? "center",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, mediaType, alt, width, align } = HTMLAttributes;

    const shared: Record<string, string> = { "data-tiptap-media": "" };
    if (align && align !== "center") shared["data-align"] = align;
    if (width) shared["data-width"] = width;
    const style = width ? `width:${width};max-width:100%` : undefined;

    if (mediaType === "audio") {
      return ["audio", mergeAttributes(shared, { src, controls: "" })];
    }
    if (mediaType === "video") {
      return ["video", mergeAttributes(shared, { src, controls: "", ...(style && { style }) })];
    }
    return ["img", mergeAttributes(shared, { src, alt, ...(style && { style }) })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaEmbedView);
  },
});
