/**
 * Azhura CBT Backend — Supervisor Media Routes (#88).
 *
 * Supervisors need read + upload access to the media library to embed files
 * in WYSIWYG question editors. Delete is intentionally excluded — only admins
 * may remove media. The implementation mirrors admin/media.ts GET + POST
 * without duplication of the heavy upload machinery (validateAndSave).
 *
 * Endpoints (supervisor or admin role):
 * - `GET  /api/supervisor/media`  — paginated list (same filters as admin)
 * - `POST /api/supervisor/media`  — upload a file to the shared library
 */

import { Elysia, t } from "elysia";
import { randomUUID } from "crypto";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { authPlugin } from "../middleware/requireAuth";
import { ForbiddenError } from "../lib/errors";
import { validateAndSave } from "../lib/upload";
import { createLogger } from "../lib/logger";
import type { MediaType } from "@azhura/shared";

const { media } = schema;
const log = createLogger("SupervisorMedia");
const VALID_TYPES: MediaType[] = ["image", "audio", "video"];

export const supervisorMediaRoutes = new Elysia({ prefix: "/supervisor" })
  .use(authPlugin)
  .onBeforeHandle(({ user }) => {
    if (user.role !== "supervisor" && user.role !== "admin") {
      throw new ForbiddenError("Akses ditolak.");
    }
  })

  /**
   * GET /api/supervisor/media
   *
   * Lists all media. Supports the same type + q + pagination filters as the
   * admin counterpart so the console media picker can reuse the same query
   * parameters.
   */
  .get(
    "/media",
    async ({ query }) => {
      const page = Math.max(1, query.page ?? 1);
      const limit = Math.min(100, Math.max(1, query.limit ?? 20));
      const offset = (page - 1) * limit;
      const search = query.q?.trim() || undefined;
      const typeFilter =
        query.type && VALID_TYPES.includes(query.type as MediaType)
          ? (query.type as MediaType)
          : undefined;

      const filters = [];
      if (typeFilter) filters.push(eq(media.type, typeFilter));
      if (search) filters.push(like(media.originalName, `%${search}%`));
      const where = filters.length > 0 ? and(...filters) : undefined;

      const [countResult, rows] = await Promise.all([
        db.select({ total: sql<number>`count(*)` }).from(media).where(where),
        db
          .select({
            id: media.id,
            filename: media.filename,
            originalName: media.originalName,
            type: media.type,
            mimeType: media.mimeType,
            sizeBytes: media.sizeBytes,
            url: media.url,
            uploadedBy: media.uploadedBy,
            createdAt: media.createdAt,
          })
          .from(media)
          .where(where)
          .orderBy(desc(media.createdAt))
          .limit(limit)
          .offset(offset),
      ]);

      return {
        data: rows,
        meta: { total: Number(countResult[0].total), page, limit },
      };
    },
    {
      query: t.Object({
        type: t.Optional(t.String()),
        q: t.Optional(t.String()),
        page: t.Optional(t.Number({ minimum: 1 })),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
    }
  )

  /**
   * POST /api/supervisor/media
   *
   * Uploads a file to the shared media library. Uses the same validateAndSave
   * logic as the admin upload — MIME validation, per-type size limits, and
   * disk storage — so the library stays consistent regardless of uploader role.
   */
  .post(
    "/media",
    async ({ body, user, set }) => {
      const saved = await validateAndSave(body.file, user.userId);

      const id = randomUUID();
      await db.insert(media).values({
        id,
        filename: saved.filename,
        originalName: saved.originalName,
        type: saved.type,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        url: saved.url,
        uploadedBy: user.userId,
        createdAt: Date.now(),
      });

      log.info("Media uploaded", { id, filename: saved.filename, type: saved.type, by: user.userId });
      set.status = 201;
      return { id, ...saved, uploadedBy: user.userId, createdAt: Date.now() };
    },
    { body: t.Object({ file: t.File() }) }
  );
