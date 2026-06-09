import DOMPurify from "dompurify";
import "../editor/editor.css";

interface QuestionContentRendererProps {
  html: string;
  className?: string;
}

export function QuestionContentRenderer({ html, className = "" }: QuestionContentRendererProps) {
  const safe = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  return (
    <div
      className={`tiptap-editor ${className}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
