import { useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import renderMathInElement from "katex/contrib/auto-render";

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
    // Set innerHTML and render KaTeX in one atomic sequence so React's
    // reconciler never overwrites KaTeX output between the two steps.
    ref.current.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    renderMathInElement(ref.current, MATH_OPTIONS);
  }, [html]);

  return <div ref={ref} className={className} />;
}
