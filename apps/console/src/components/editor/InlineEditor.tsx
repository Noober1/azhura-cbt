/**
 * Azhura CBT Console — InlineEditor (#88).
 *
 * Lightweight TipTap editor for option text. Supports only inline formatting
 * (bold, italic, underline, strike) and KaTeX math ($…$ inline only).
 * No block elements, no media — keeps option editors slim and focusable.
 */

import "./editor.css";
import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { Mathematics } from "@tiptap/extension-mathematics";
import { BoldIcon, ItalicIcon, UnderlineIcon } from "../ui/icons";

interface InlineEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
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
      className={`focus-ring inline-flex size-6 items-center justify-center rounded text-[0.6875rem] transition-colors disabled:opacity-40 ${
        active
          ? "bg-accent/15 text-accent"
          : "text-ink-soft hover:bg-canvas hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function InlineEditor({ value, onChange, placeholder, disabled }: InlineEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        orderedList: false,
        heading: false,
        horizontalRule: false,
        codeBlock: false,
        listItem: false,
      }),
      Underline,
      Mathematics,
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  // Sync external value → editor only when value changes from outside.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    if (editor.getHTML() === value) return;
    editor.commands.setContent(value, false);
  }, [editor, value]);

  return (
    <div className={`tiptap-inline overflow-hidden rounded-[var(--radius-field)] border border-line bg-surface transition-colors focus-within:border-accent/60 ${disabled ? "opacity-55" : ""}`}>
      {/* Mini toolbar */}
      <div className="flex items-center gap-0.5 border-b border-line px-1.5 py-1">
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive("bold")}
          disabled={disabled}
          title="Bold"
        >
          <BoldIcon className="size-3" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive("italic")}
          disabled={disabled}
          title="Italic"
        >
          <ItalicIcon className="size-3" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          active={editor?.isActive("underline")}
          disabled={disabled}
          title="Underline"
        >
          <UnderlineIcon className="size-3" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().insertContent("$x$").run()}
          disabled={disabled}
          title="Rumus inline ($…$)"
        >
          <span className="font-serif italic">∑</span>
        </ToolbarButton>
      </div>

      <EditorContent
        editor={editor}
        className="text-sm text-ink"
        {...(placeholder ? { "data-placeholder": placeholder } : {})}
      />
    </div>
  );
}
