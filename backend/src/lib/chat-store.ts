/**
 * Azhura CBT Backend - Chat message persistence (#17)
 *
 * Thin data-access layer for the public chat room. Messages are durable (audit
 * + history that survives restarts), mirroring the logs feature's DB-backed
 * history (`log-store.ts`). The socket layer streams the live tail; this module
 * owns the write and the bounded join-history read.
 */

import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import type { ChatMessage, ChatMessageKind } from "@azhura/shared";
import { db, schema } from "../db";

const { chatMessages, users, groups } = schema;

/** Fields needed to persist a new message; `id`/`timestamp` are assigned here. */
export interface NewChatMessage {
  kind: ChatMessageKind;
  userId: string | null;
  name: string;
  groupName: string | null;
  content: string;
}

/**
 * Persists a chat message and returns the full {@link ChatMessage} (with its
 * generated id + timestamp) ready to broadcast.
 */
export async function saveChatMessage(input: NewChatMessage): Promise<ChatMessage> {
  const message: ChatMessage = {
    id: randomUUID(),
    kind: input.kind,
    userId: input.userId,
    name: input.name,
    groupName: input.groupName,
    content: input.content,
    timestamp: Date.now(),
  };

  await db.insert(chatMessages).values({
    id: message.id,
    kind: message.kind,
    userId: message.userId,
    name: message.name,
    groupName: message.groupName,
    content: message.content,
    createdAt: message.timestamp,
  });

  return message;
}

/**
 * Returns the most recent `limit` messages ordered **oldest→newest** for a
 * natural top-to-bottom render on join.
 */
export async function getRecentChat(limit: number): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .orderBy(desc(chatMessages.createdAt))
    .limit(Math.max(1, Math.floor(limit)));

  // Query is newest-first (so the LIMIT keeps the latest); reverse for render.
  return rows.reverse().map((row) => ({
    id: row.id,
    kind: row.kind,
    userId: row.userId,
    name: row.name,
    groupName: row.groupName,
    content: row.content,
    timestamp: row.createdAt,
  }));
}

/** A chat participant's display identity (denormalized onto each message). */
export interface ChatIdentity {
  name: string;
  groupName: string | null;
}

/**
 * Loads a user's display name and group name for stamping onto their chat
 * messages and presence entry. Returns null when the user no longer exists.
 */
export async function getChatIdentity(userId: string): Promise<ChatIdentity | null> {
  const rows = await db
    .select({ name: users.name, groupName: groups.name })
    .from(users)
    .leftJoin(groups, eq(groups.id, users.groupId))
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  return row ? { name: row.name, groupName: row.groupName ?? null } : null;
}
