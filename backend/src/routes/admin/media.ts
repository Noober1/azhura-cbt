/**
 * Azhura CBT Backend — Admin Media Library Routes (#84).
 *
 * Manages the centralized media library. Files are stored in `backend/uploads/`
 * under type-specific subdirectories; metadata lives in the `media` table.
 * Static serving of `/uploads/*` is handled in `index.ts` (streamed, not buffered).
 *
 * Endpoints (all admin-only, under `/api/admin`):
 * - `POST   /admin/media`        — upload (multipart, field: "file")
 * - `GET    /admin/media`        — list with filter (type, q) + pagination
 * - `DELETE /admin/media/:id`    — delete file from disk + DB
 */

import { Elysia, t } from "elysia";
import { randomUUID } from "crypto";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { db, schema } from "../../db";
import { authPlugin } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { NotFoundError } from "../../lib/errors";
import { validateAndSave, deleteUploadFile } from "../../lib/upload";
import { createLogger } from "../../lib/logger";
import type { MediaType } from "@azhura/shared";

const { media } = schema;

const log = createLogger("AdminMedia");

const VALID_TYPES: MediaType[] = ["image", "audio", "video"];

export const adminMediaRoutes = new Elysia({ prefix: "/admin" })
  .use(authPlugin)
  .onBeforeHandle(requireAdmin)

  /**
   * POST /api/admin/media
   *
   * Accepts a multipart/form-data upload with a single `file` field.
   * Validates MIME type from magic bytes and enforces per-type size limits
   * before writing to disk and inserting a DB record.
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

      log.info("Media uploaded", { id, filename: saved.filename, type: saved.type, userId: user.userId });
      set.status = 201;
      return { id, ...saved, uploadedBy: user.userId, createdAt: Date.now() };
    },
    {
      body: t.Object({ file: t.File() }),
    }
  )

  /**
   * GET /api/admin/media
   *
   * Paginated list of media. Supports filtering by `type` and searching by
   * original file name. Returns rows sorted by upload date descending.
   */
  .get(
    "/media",
    async ({ query }) => {
      const page = Math.max(1, query.page ?? 1);
      const limit = Math.min(100, Math.max(1, query.limit ?? 20));
      const offset = (page - 1) * limit;
      const search = query.q?.trim() || undefined;
      const typeFilter = query.type && VALID_TYPES.includes(query.type as MediaType)
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
   * DELETE /api/admin/media/:id
   *
   * Deletes the file from disk and removes the DB record.
   * Returns 404 if the media does not exist.
   */
  .delete("/media/:id", async ({ params }) => {
    const { id } = params;

    const row = await db.query.media.findFirst({
      where: eq(media.id, id),
    });
    if (!row) throw new NotFoundError("Media tidak ditemukan.");

    await deleteUploadFile(row.filename, row.type);
    await db.delete(media).where(eq(media.id, id));

    log.info("Media deleted", { id, filename: row.filename });
    return { success: true };
  });
