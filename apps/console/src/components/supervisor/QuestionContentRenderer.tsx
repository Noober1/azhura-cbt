import DOMPurify from "dompurify";
import renderMathInElement from "katex/contrib/auto-render";
import { useEffect, useRef } from "react";
import "../editor/editor.css";
import { resolveMediaUrl } from "../../lib/format";

/** Selector for every element whose `src`/`poster` may hold a media path. */
const MEDIA_SELECTOR = "[data-tiptap-media], img, audio, video, source";

/**
 * Rewrites relative `/uploads/...` `src`/`poster` attributes to absolute URLs
 * rooted at the backend origin. Stems persist media as relative paths (so the
 * server-side `^/uploads/` guard accepts them); the console renders from a
 * different origin, so display needs the absolute form. Absolute http(s) URLs
 * pass through `resolveMediaUrl` untouched.
 */
function resolveMediaInElement(root: HTMLElement): void {
  for (const el of root.querySelectorAll(MEDIA_SELECTOR)) {
    for (const attr of ["src", "poster"] as const) {
      const value = el.getAttribute(attr);
      if (value && value.startsWith("/uploads/")) {
        el.setAttribute(attr, resolveMediaUrl(value));
      }
    }
  }
}

const MATH_OPTIONS = {
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "$", right: "$", display: false },
    { left: "\\(", right: "\\)", display: false },
    { left: "\\[", right: "\\]", display: true },
  ],
  throwOnError: false,
};

interface QuestionContentRendererProps {
  html: string;
  className?: string;
}

export function QuestionContentRenderer({ html, className = "" }: QuestionContentRendererProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    resolveMediaInElement(ref.current);
    renderMathInElement(ref.current, MATH_OPTIONS);
  }, [html]);

  return <div ref={ref} className={`tiptap-editor ${className}`} />;
}
