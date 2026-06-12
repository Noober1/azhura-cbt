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
import { useEffect, useState } from "react";
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
import { Tooltip } from "../ui/Tooltip";

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
  /** Tooltip text + accessible name for this icon-only control. */
  label: string;
  children: React.ReactNode;
}

/**
 * Icon-only toolbar control. Wraps the button in a {@link Tooltip} (visible on
 * hover and keyboard focus) and mirrors the same text into `aria-label` so the
 * control is announced to screen readers.
 */
function ToolbarButton({ onClick, active, disabled, label, children }: ToolbarButtonProps) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onClick(); }}
        disabled={disabled}
        aria-label={label}
        className={`focus-ring inline-flex size-7 items-center justify-center rounded transition-colors disabled:opacity-40 ${
          active
            ? "bg-accent/15 text-accent"
            : "text-ink-soft hover:bg-canvas hover:text-ink"
        }`}
      >
        {children}
      </button>
    </Tooltip>
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
      Mathematics.configure({
        // Match $…$, \(…\), and \[…\] — each in its own capture group so
        // match.slice(1).find(Boolean) always returns the formula content.
        regex: /\$([^$]*)\$|\\\((.+?)\\\)|\\\[(.+?)\\\]/gis,
      }),
      MediaEmbed,
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  // Sync external value → editor only when value changes from outside (edit mode load,
  // form reset). useEffect ensures this never runs mid-render, avoiding infinite loops.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    if (editor.getHTML() === value) return;
    editor.commands.setContent(value, false);
  }, [editor, value]);

  function handleMediaSelect(file: MediaFile) {
    setPickerOpen(false);
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "mediaEmbed",
        attrs: {
          // Store the RELATIVE `/uploads/...` path (matching how option images
          // are persisted). The server-side stem guard only accepts `/uploads/`,
          // and MediaEmbedView resolves it to an absolute URL for in-editor
          // display. Storing the absolute URL here would fail that guard.
          src: file.url,
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
          label="Tebal"
        >
          <BoldIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive("italic")}
          disabled={disabled}
          label="Miring"
        >
          <ItalicIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          active={editor?.isActive("underline")}
          disabled={disabled}
          label="Garis bawah"
        >
          <UnderlineIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          active={editor?.isActive("strike")}
          disabled={disabled}
          label="Coret"
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
            label={`Judul ${level}`}
          >
            <span className="text-[0.625rem] font-bold">H{level}</span>
          </ToolbarButton>
        ))}

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive("bulletList")}
          disabled={disabled}
          label="Daftar poin"
        >
          <ListIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={editor?.isActive("orderedList")}
          disabled={disabled}
          label="Daftar bernomor"
        >
          <ListOrderedIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          active={editor?.isActive("blockquote")}
          disabled={disabled}
          label="Kutipan"
        >
          <BlockquoteIcon className="size-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={insertInlineMath}
          disabled={disabled}
          label="Rumus inline"
        >
          <span className="font-serif text-xs italic">∑</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={insertBlockMath}
          disabled={disabled}
          label="Rumus blok"
        >
          <span className="font-serif text-[0.625rem] italic">∑∑</span>
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
          label="Sisipkan media"
        >
          <ImagePlusIcon className="size-3.5" />
        </ToolbarButton>

        <div className="ml-auto flex gap-0.5">
          <ToolbarButton
            onClick={() => editor?.chain().focus().undo().run()}
            disabled={disabled || !editor?.can().undo()}
            label="Urungkan"
          >
            <UndoIcon className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().redo().run()}
            disabled={disabled || !editor?.can().redo()}
            label="Ulangi"
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
