import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DOMPurify from "dompurify";
import renderMathInElement from "katex/contrib/auto-render";
import { resolveMediaUrl } from "../../lib/media";
import { parseMaxPlaysAttr, parseNoSeekAttr } from "../../lib/media-integrity";

// Vidstack is heavy (~400 kB) — code-split it so exams without audio/video
// never load the player bundle (#164).
const MediaPlayer = lazy(() =>
  import("./MediaPlayer").then((m) => ({ default: m.MediaPlayer }))
);

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

/** A custom player island to mount in place of a native `<audio>`/`<video>` (#164). */
interface MediaMount {
  /** Stable key for React reconciliation. */
  key: string;
  /** The placeholder element the player portals into. */
  container: HTMLElement;
  type: "audio" | "video";
  src: string;
  maxPlays: number | null;
  noSeek: boolean;
}

/**
 * Replaces every native `<audio>`/`<video>` in `root` with an empty placeholder
 * and returns the descriptors needed to portal a custom {@link MediaPlayer}
 * into each. Reading the (already path-resolved) `src` and the integrity
 * `data-*` attributes here keeps the exam-integrity controls (#164) self-
 * contained in the persisted HTML — no schema/backend change.
 */
function extractMediaMounts(root: HTMLElement): MediaMount[] {
  const mounts: MediaMount[] = [];
  const nodes = root.querySelectorAll<HTMLMediaElement>("audio, video");
  nodes.forEach((el, index) => {
    const src = el.getAttribute("src") ?? "";
    if (!src) return;
    const type = el.tagName.toLowerCase() === "video" ? "video" : "audio";
    const placeholder = document.createElement("span");
    placeholder.className = "nb-media-mount";
    el.replaceWith(placeholder);
    mounts.push({
      key: `${index}:${src}`,
      container: placeholder,
      type,
      src,
      maxPlays: parseMaxPlaysAttr(el.getAttribute("data-max-plays")),
      noSeek: parseNoSeekAttr(el.getAttribute("data-no-seek")),
    });
  });
  return mounts;
}

interface RichContentProps {
  html: string;
  className?: string;
  /**
   * Owning question id. Threaded into the media player so a clip's play-count
   * budget (#164) persists per question across navigation/refresh.
   */
  questionId?: string;
}

export function RichContent({ html, className, questionId }: RichContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounts, setMounts] = useState<MediaMount[]>([]);

  useEffect(() => {
    if (!ref.current) return;
    // Set innerHTML, resolve media paths, swap native media for custom-player
    // placeholders, then render KaTeX — one atomic sequence so React's
    // reconciler never overwrites the output between steps.
    ref.current.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    resolveMediaInElement(ref.current);
    setMounts(extractMediaMounts(ref.current));
    renderMathInElement(ref.current, MATH_OPTIONS);
  }, [html]);

  return (
    <div ref={ref} className={className}>
      {mounts.map((m) =>
        createPortal(
          <Suspense
            fallback={
              <div
                style={{
                  padding: "0.75rem 1rem",
                  border: "2.5px solid var(--nb-ink)",
                  borderRadius: "0.75rem",
                  background: "#fff",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--muted-foreground)",
                }}
              >
                Memuat media…
              </div>
            }
          >
            <MediaPlayer
              src={m.src}
              type={m.type}
              questionId={questionId}
              maxPlays={m.maxPlays}
              noSeek={m.noSeek}
            />
          </Suspense>,
          m.container,
          m.key
        )
      )}
    </div>
  );
}
