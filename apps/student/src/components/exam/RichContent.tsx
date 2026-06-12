import { useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import renderMathInElement from "katex/contrib/auto-render";
import { resolveMediaUrl } from "../../lib/media";

/** Selector for every element whose `src`/`poster` may hold a media path. */
const MEDIA_SELECTOR = "[data-tiptap-media], img, audio, video, source";

/**
 * Rewrites relative `/uploads/...` `src`/`poster` attributes to absolute URLs
 * rooted at the configured server origin. Stems persist media as relative paths
 * (the backend `^/uploads/` guard requires it); the exam client may run from a
 * different origin (Tauri / dev server), so display needs the absolute form.
 * Absolute http(s) URLs pass through `resolveMediaUrl` untouched.
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

interface RichContentProps {
  html: string;
  className?: string;
}

export function RichContent({ html, className }: RichContentProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    // Set innerHTML, resolve media paths, and render KaTeX in one atomic
    // sequence so React's reconciler never overwrites the output between steps.
    ref.current.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    resolveMediaInElement(ref.current);
    renderMathInElement(ref.current, MATH_OPTIONS);
  }, [html]);

  return <div ref={ref} className={className} />;
}
