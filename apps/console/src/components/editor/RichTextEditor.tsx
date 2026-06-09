/**
 * Azhura CBT Console — RichTextEditor (#88).
 *
 * Full WYSIWYG editor for question text. Wraps TipTap with:
 * - StarterKit (bold, italic, headings, lists, blockquote, undo/redo, …)
 * - Underline
 * - Mathematics (KaTeX inline + block math via $…$ / $$…$$)
 * - MediaEmbed (images, audio, video from the media library)
 *
 * The toolbar includes all formatting actions plus math and media insertion.
 * Media selection is handled internally via MediaPickerModal — the caller
 * provides list/upload functions so the correct API endpoint is used.
 */

import "./editor.css";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { Mathematics } from "@tiptap/extension-mathematics";
import { MediaEmbed } from "./MediaEmbed";
import { MediaPickerModal } from "./MediaPickerModal";
import { useState } from "react";
import type { MediaFile, MediaListResponse } from "../../types";
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  ListIcon,
  ListOrderedIcon,
  BlockquoteIcon,
  UndoIcon,
  RedoIcon,
  ImagePlusIcon,
} from "../ui/icons";
import { resolveMediaUrl } from "../../lib/format";

type ListFn = (
  params: { type?: string; q?: string; page?: number; limit?: number },
  signal?: AbortSignal
) => Promise<MediaListResponse>;

type UploadFn = (file: File, onProgress?: (pct: number) => void) => Promise<MediaFile>;

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  mediaListFn: ListFn;
  mediaUploadFn: UploadFn;
}

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={`focus-ring inline-flex size-7 items-center justify-center rounded transition-colors disabled:opacity-40 ${
        active
          ? "bg-accent/15 text-accent"
          : "text-ink-soft hover:bg-canvas hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-4 w-px bg-line" />;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  disabled,
  mediaListFn,
  mediaUploadFn,
}: RichTextEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Mathematics,
      MediaEmbed,
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  // Sync external value changes (e.g. on form reset / edit mode load).
  // Only set content if the value changed from outside (not from typing).
  const editorHTML = editor?.getHTML() ?? "";
  if (editor && value !== editorHTML && !editor.isFocused) {
    editor.commands.setContent(value, false);
  }

  function handleMediaSelect(file: MediaFile) {
    setPickerOpen(false);
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "mediaEmbed",
        attrs: {
          src: resolveMediaUrl(file.url),
          mediaType: file.type,
          alt: file.originalName,
        },
      })
      .run();
  }

  function insertInlineMath() {
    editor?.chain().focus().insertContent("$x$").run();
  }

  function insertBlockMath() {
    editor?.chain().focus().insertContent("\n$$\nx\n$$\n").run();
  }

  return (
    <div className={`tiptap-editor overflow-hidden rounded-[var(--radius-field)] border border-line bg-surface transition-colors focus-within:border-accent/60 ${disabled ? "opacity-55" : ""}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1.5">
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive("bold")}
          disabled={disabled}
          title="Bold"
        >
          <BoldIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive("italic")}
          disabled={disabled}
          title="Italic"
        >
          <ItalicIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          active={editor?.isActive("underline")}
          disabled={disabled}
          title="Underline"
        >
          <UnderlineIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          active={editor?.isActive("strike")}
          disabled={disabled}
          title="Strikethrough"
        >
          <StrikethroughIcon className="size-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        {([1, 2, 3] as const).map((level) => (
          <ToolbarButton
            key={level}
            onClick={() => editor?.chain().focus().toggleHeading({ level }).run()}
            active={editor?.isActive("heading", { level })}
            disabled={disabled}
            title={`Heading ${level}`}
          >
            <span className="text-[0.625rem] font-bold">H{level}</span>
          </ToolbarButton>
        ))}

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive("bulletList")}
          disabled={disabled}
          title="Bullet list"
        >
          <ListIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={editor?.isActive("orderedList")}
          disabled={disabled}
          title="Ordered list"
        >
          <ListOrderedIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          active={editor?.isActive("blockquote")}
          disabled={disabled}
          title="Blockquote"
        >
          <BlockquoteIcon className="size-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={insertInlineMath}
          disabled={disabled}
          title="Masukkan rumus inline ($…$)"
        >
          <span className="font-serif text-xs italic">∑</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={insertBlockMath}
          disabled={disabled}
          title="Masukkan rumus blok ($$…$$)"
        >
          <span className="font-serif text-[0.625rem] italic">∑∑</span>
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
          title="Sisipkan media"
        >
          <ImagePlusIcon className="size-3.5" />
        </ToolbarButton>

        <div className="ml-auto flex gap-0.5">
          <ToolbarButton
            onClick={() => editor?.chain().focus().undo().run()}
            disabled={disabled || !editor?.can().undo()}
            title="Undo"
          >
            <UndoIcon className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().redo().run()}
            disabled={disabled || !editor?.can().redo()}
            title="Redo"
          >
            <RedoIcon className="size-3.5" />
          </ToolbarButton>
        </div>
      </div>

      {/* Editor content */}
      <EditorContent
        editor={editor}
        className="text-sm text-ink"
        {...(placeholder
          ? { "data-placeholder": placeholder }
          : {})}
      />

      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleMediaSelect}
        listFn={mediaListFn}
        uploadFn={mediaUploadFn}
      />
    </div>
  );
}
