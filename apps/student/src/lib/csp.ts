/**
 * Azhura CBT App — Content Security Policy (#191).
 *
 * Defense-in-depth that blocks external media (img/audio/video) at the browser
 * layer while still allowing `/uploads` media served by the configured backend
 * origin. Question/option media is stored relative and resolved at render time
 * against `serverUrl` (per-school, dynamic — see `lib/media.ts`).
 *
 * Because the backend origin is unknown at build time, a static
 * `tauri.conf.json` CSP cannot pin it. The static Tauri baseline is therefore a
 * necessary bootstrap artifact (deliberately broad on schemes); the real
 * enforcement is a runtime `<meta http-equiv="Content-Security-Policy">`
 * injected once the resolved `serverUrl` is known (`applyCspMeta`), which
 * overwrites/tightens it to the exact origin. The baseline is only live for the
 * brief window before `config.initialize()` resolves — before any exam content
 * renders. This works in both the web build and the Tauri webview.
 *
 * The policy is intentionally **minimal**: `img-src`/`media-src`/`connect-src`/
 * `font-src` are locked to `'self'` + the backend origin (+ `data:`/`blob:`),
 * but `script-src`/`style-src` stay permissive (`'unsafe-inline'`) so KaTeX,
 * Vite, and fonts keep working.
 */

/**
 * Derives the ws/wss origin from an http(s) origin
 * (`http:` → `ws:`, `https:` → `wss:`). Returns `null` for non-http origins.
 */
function toWsOrigin(origin: string): string | null {
  if (origin.startsWith("https://")) return `wss://${origin.slice("https://".length)}`;
  if (origin.startsWith("http://")) return `ws://${origin.slice("http://".length)}`;
  return null;
}

/**
 * Builds the exam-client CSP string for a given configured server URL.
 *
 * When `serverUrl` is empty or invalid, only `'self'` (+ `data:`/`blob:`)
 * sources are emitted — which still blocks all external media. When valid, the
 * resolved http origin (and its ws/wss counterpart) is appended to the media
 * and connection directives so legitimately-served `/uploads` assets and the
 * API/Socket.io traffic to that origin are allowed.
 */
export function buildExamCsp(serverUrl: string): string {
  let origin = "";
  let wsOrigin: string | null = null;

  try {
    if (serverUrl) {
      origin = new URL(serverUrl).origin;
      wsOrigin = toWsOrigin(origin);
    }
  } catch {
    // Invalid/empty input — fall back to self-only.
    origin = "";
    wsOrigin = null;
  }

  const imgSources = ["'self'", "data:", "blob:", origin].filter(Boolean);
  const mediaSources = ["'self'", "blob:", origin].filter(Boolean);
  const connectSources = ["'self'", origin, wsOrigin].filter(Boolean);

  const directives = [
    "default-src 'self'",
    `img-src ${imgSources.join(" ")}`,
    `media-src ${mediaSources.join(" ")}`,
    `connect-src ${connectSources.join(" ")}`,
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-src 'none'",
  ];

  return directives.join("; ");
}

const CSP_META_SELECTOR = 'meta[http-equiv="Content-Security-Policy"]';

/**
 * Upserts a single `<meta http-equiv="Content-Security-Policy">` element in
 * `document.head` with the given policy. Reuses an existing element if present,
 * otherwise creates and appends one. No-op outside a browser/webview context.
 *
 * @param csp The policy string to write into the meta tag's `content`.
 * @param doc Document to mutate; defaults to the ambient `document`. Injectable
 *   so the upsert/create branches are unit-testable without a DOM environment.
 */
export function applyCspMeta(csp: string, doc: Document | undefined = globalThis.document): void {
  if (!doc) return;

  const existing = doc.head.querySelector<HTMLMetaElement>(CSP_META_SELECTOR);
  if (existing) {
    existing.setAttribute("content", csp);
    return;
  }

  const meta = doc.createElement("meta");
  meta.setAttribute("http-equiv", "Content-Security-Policy");
  meta.setAttribute("content", csp);
  doc.head.appendChild(meta);
}
