/**
 * TipTap extension — MediaEmbed (#88).
 *
 * A block-level atom node that renders images, audio, and video embedded from
 * the media library. The node is draggable so supervisors can reorder media
 * blocks. HTML serialization outputs native elements with `data-tiptap-media`
 * so the CSS can target them and they round-trip through parse/serialize.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import type { MediaType } from "../../types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mediaEmbed: {
      insertMedia: (attrs: {
        src: string;
        mediaType: MediaType;
        alt?: string;
      }) => ReturnType;
    };
  }
}

export const MediaEmbed = Node.create({
  name: "mediaEmbed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      mediaType: { default: "image" as MediaType },
      alt: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "img[data-tiptap-media]",
        getAttrs: (el) => ({
          src: (el as HTMLImageElement).getAttribute("src"),
          mediaType: "image" as MediaType,
          alt: (el as HTMLImageElement).getAttribute("alt") ?? "",
        }),
      },
      {
        tag: "audio[data-tiptap-media]",
        getAttrs: (el) => ({
          src: (el as HTMLAudioElement).getAttribute("src"),
          mediaType: "audio" as MediaType,
        }),
      },
      {
        tag: "video[data-tiptap-media]",
        getAttrs: (el) => ({
          src: (el as HTMLVideoElement).getAttribute("src"),
          mediaType: "video" as MediaType,
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, mediaType, alt } = HTMLAttributes as {
      src: string;
      mediaType: MediaType;
      alt?: string;
    };

    if (mediaType === "image") {
      return [
        "img",
        mergeAttributes({ src, alt: alt ?? "", "data-tiptap-media": "" }),
      ];
    }
    if (mediaType === "audio") {
      return [
        "audio",
        mergeAttributes({ src, controls: "", "data-tiptap-media": "" }),
      ];
    }
    return [
      "video",
      mergeAttributes({ src, controls: "", "data-tiptap-media": "" }),
    ];
  },

  addCommands() {
    return {
      insertMedia:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name, attrs });
        },
    };
  },
});
