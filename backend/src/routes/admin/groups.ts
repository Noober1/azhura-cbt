/**
 * Azhura CBT Backend - Admin Group Routes (Drizzle)
 *
 * Admin-only CRUD for student groups (classes/cohorts), gated to the `admin`
 * role via {@link requireAdmin}. Endpoints (all under `/api/admin`):
 * - `GET    /admin/groups`          — paginated, searchable listing + member counts.
 * - `GET    /admin/groups/:groupId` — single group + member count.
 * - `POST   /admin/groups`          — create a group.
 * - `PATCH  /admin/groups/:groupId` — rename a group.
 * - `DELETE /admin/groups/:groupId` — delete; members' `group_id` is set NULL and
 *                                     exam links cascade (see schema FKs).
 *
 * Groups underpin exam scoping (`exam_groups`) and student membership
 * (`users.group_id`), so this is the data the console's group picker consumes.
 */

import { Elysia, t } from "elysia";
import { randomUUID } from "crypto";
import { asc, eq, inArray, like, sql } from "drizzle-orm";
import { db, schema } from "../../db";
import { authPlugin } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { notifyDashboardStats } from "./dashboard";
import { createLogger } from "../../lib/logger";

const { groups, users } = schema;

const log = createLogger("AdminGroup");

/** Number of students assigned to a single group. */
async function getMemberCount(groupId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.groupId, groupId));
  return Number(count);
}

/** Fetches a group or throws 404. */
async function getGroupOrThrow(groupId: string) {
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
  });
  if (!group) throw new NotFoundError("Group tidak ditemukan.");
  return group;
}

export const adminGroupRoutes = new Elysia({ prefix: "/admin" })
  .use(authPlugin)
  .onBeforeHandle(requireAdmin)

  /**
   * GET /api/admin/groups?q=&page=&limit=
   * Paginated, name-searchable listing with per-group member counts.
   * @returns `{ data, meta: { total, page, limit } }`
   */
  .get(
    "/groups",
    async ({ query }) => {
      const page = Math.max(1, query.page ?? 1);
      const limit = Math.min(100, Math.max(1, query.limit ?? 20));
      const offset = (page - 1) * limit;
      const search = query.q?.trim();
      const where = search ? like(groups.name, `%${search}%`) : undefined;

      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(groups)
        .where(where);

      const rows = await db
        .select({ id: groups.id, name: groups.name, code: groups.code })
        .from(groups)
        .where(where)
        .orderBy(asc(groups.name))
        .limit(limit)
        .offset(offset);

      const ids = rows.map((r) => r.id);

      // Batch member counts to avoid an N+1 query per group.
      const counts = ids.length
        ? await db
            .select({ groupId: users.groupId, count: sql<number>`count(*)` })
            .from(users)
            .where(inArray(users.groupId, ids))
            .groupBy(users.groupId)
        : [];
      const byId = new Map(counts.map((c) => [c.groupId, Number(c.count)]));

      return {
        data: rows.map((r) => ({
          id: r.id,
          name: r.name,
          code: r.code,
          memberCount: byId.get(r.id) ?? 0,
        })),
        meta: { total: Number(total), page, limit },
      };
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        page: t.Optional(t.Number({ minimum: 1 })),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
    }
  )

  /**
   * GET /api/admin/groups/:groupId
   * @throws {NotFoundError} when the group does not exist.
   */
  .get("/groups/:groupId", async ({ params }) => {
    const group = await getGroupOrThrow(params.groupId);
    return {
      id: group.id,
      name: group.name,
      code: group.code,
      memberCount: await getMemberCount(group.id),
    };
  })

  /**
   * POST /api/admin/groups
   * Creates a group.
   * @throws {ConflictError} when `code` is already in use.
   */
  .post(
    "/groups",
    async ({ body, set }) => {
      const id = randomUUID();
      const name = body.name.trim();
      const code = body.code.trim().toUpperCase();
      try {
        await db.insert(groups).values({ id, name, code });
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e?.code === "ER_DUP_ENTRY") {
          throw new ConflictError("Kode grup sudah digunakan.");
        }
        throw err;
      }
      log.info("Group created", { id, name, code });
      void notifyDashboardStats().catch(() => {});
      set.status = 201;
      return { id, name, code, memberCount: 0 };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 30 }),
        code: t.String({ minLength: 1, maxLength: 6 }),
      }),
    }
  )

  /**
   * PATCH /api/admin/groups/:groupId
   * Updates name and/or code of a group.
   * @throws {NotFoundError} when the group does not exist.
   * @throws {ConflictError} when `code` is already in use by another group.
   */
  .patch(
    "/groups/:groupId",
    async ({ params, body }) => {
      const { groupId } = params;
      const existing = await getGroupOrThrow(groupId);
      const updates: { name?: string; code?: string } = {};
      if (body.name !== undefined) updates.name = body.name.trim();
      if (body.code !== undefined) updates.code = body.code.trim().toUpperCase();
      if (Object.keys(updates).length > 0) {
        try {
          await db.update(groups).set(updates).where(eq(groups.id, groupId));
        } catch (err: unknown) {
          const e = err as { code?: string };
          if (e?.code === "ER_DUP_ENTRY") {
            throw new ConflictError("Kode grup sudah digunakan.");
          }
          throw err;
        }
      }
      const name = updates.name ?? existing.name;
      const code = updates.code ?? existing.code;
      log.info("Group updated", { id: groupId, name, code });
      return {
        id: groupId,
        name,
        code,
        memberCount: await getMemberCount(groupId),
      };
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 30 })),
        code: t.Optional(t.String({ minLength: 1, maxLength: 6 })),
      }),
    }
  )

  /**
   * DELETE /api/admin/groups/:groupId
   * Deletes a group. Members' `group_id` is set to NULL (they remain, ungrouped)
   * and any `exam_groups` links cascade — both per the schema's FK rules.
   * @throws {NotFoundError} when the group does not exist.
   */
  .delete("/groups/:groupId", async ({ params }) => {
    const { groupId } = params;
    await getGroupOrThrow(groupId);
    const memberCount = await getMemberCount(groupId);
    await db.delete(groups).where(eq(groups.id, groupId));
    log.info("Group deleted", { id: groupId, unassignedMembers: memberCount });
    void notifyDashboardStats().catch(() => {});
    return { success: true, unassignedMembers: memberCount };
  });
