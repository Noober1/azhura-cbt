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
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });

  useEffect(() => {
    if (ref.current) renderMathInElement(ref.current, MATH_OPTIONS);
  }, [clean]);

  return (
    <div
      ref={ref}
      className={className}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
