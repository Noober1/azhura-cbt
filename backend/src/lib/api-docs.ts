/**
 * Azhura CBT Backend — Interactive API docs mount (#177).
 *
 * Wraps the `@elysiajs/swagger` plugin behind a single feature flag so the docs
 * surface can be conditionally attached and, crucially, **kept off in
 * production** (see {@link ServerConfig.enableApiDocs}). Extracted into its own
 * helper so the gating can be unit-tested without booting the full server.
 *
 * The plugin reads the `t.Object` schemas already declared on every route, so
 * the generated OpenAPI/Scalar page stays in sync with the code automatically.
 */

import type { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";

/** Path the interactive docs are served from when enabled. */
export const API_DOCS_PATH = "/api/docs";

/** Absolute path the OpenAPI JSON spec is served from (consumed by the Scalar UI). */
export const API_DOCS_SPEC_PATH = `${API_DOCS_PATH}/json`;

/** Any Elysia instance — the wrapper is schema-agnostic, so we don't constrain the generics. */
type AnyElysia = Elysia<any, any, any, any, any, any, any>;

interface ApiDocsOptions {
  /** When false (default/prod) the docs route is never registered → 404. */
  enabled: boolean;
  /** App version surfaced in the docs header (from `APP_VERSION`). */
  version: string;
}

/**
 * Conditionally mounts the interactive API docs on `app`. Returns `app`
 * unchanged when `enabled` is false, so a disabled deployment exposes no docs
 * route at all. The generic is preserved so Elysia's chained types survive.
 */
export function applyApiDocs<T extends AnyElysia>(
  app: T,
  { enabled, version }: ApiDocsOptions
): T {
  if (!enabled) return app;
  return app.use(
    swagger({
      path: API_DOCS_PATH,
      documentation: {
        info: {
          title: "Azhura CBT API",
          version,
          description:
            "Dokumentasi HTTP API Azhura CBT (di-generate dari schema route). " +
            "Event realtime (Socket.io) & invarian perilaku ada di API_CONTRACT.md.",
        },
      },
      // The plugin defaults the Scalar spec URL to a *relative* path
      // (`api/docs/json`), which the browser resolves against the page URL
      // `/api/docs` into the broken `/api/api/docs/json` (500). Pin it to the
      // absolute spec path so the multi-segment docs path loads correctly.
      scalarConfig: { spec: { url: API_DOCS_SPEC_PATH } },
    })
  ) as unknown as T;
}
