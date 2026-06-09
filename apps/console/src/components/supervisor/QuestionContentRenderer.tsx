import DOMPurify from "dompurify";
import renderMathInElement from "katex/contrib/auto-render";
import { useEffect, useRef } from "react";
import "../editor/editor.css";

const MATH_OPTIONS = {
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "$", right: "$", display: false },
  ],
  throwOnError: false,
};

interface QuestionContentRendererProps {
  html: string;
  className?: string;
}

export function QuestionContentRenderer({ html, className = "" }: QuestionContentRendererProps) {
  const ref = useRef<HTMLDivElement>(null);
  const safe = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });

  useEffect(() => {
    if (ref.current) {
      renderMathInElement(ref.current, MATH_OPTIONS);
    }
  }, [html]);

  return (
    <div
      ref={ref}
      className={`tiptap-editor ${className}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
