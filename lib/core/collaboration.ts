/**
 * Team Collaboration Engine
 *
 * Enable seamless team communication within Cyncro:
 * - Threaded conversations on contacts, deals, activities
 * - @mention team members (triggers notifications)
 * - Shared notes and knowledge base
 * - Read/unread tracking
 * - Real-time activity (in production with WebSockets)
 * - File attachments and sharing
 *
 * Similar to: Slack threads, Asana comments, HubSpot notes
 */

import { coreDb } from "@/lib/core/db";
import { sendSlackNotification } from "@/lib/core/slack";

export interface CollaborationThread {
  id: string;
  tenantId: string;
  resourceType: string;
  resourceId: string;
  title?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface CollaborationMessage {
  id: string;
  tenantId: string;
  threadId: string;
  authorId?: string;
  authorEmail: string;
  content: string;
  mentions?: string[];
  attachments?: string[];
  editedAt?: string;
  createdAt: string;
}

export interface SharedNote {
  id: string;
  tenantId: string;
  title: string;
  content?: string;
  ownerId?: string;
  isPublic: boolean;
  sharedWith?: string[];
  createdAt: string;
  updatedAt: string;
}

/** Create collaboration thread on resource */
export async function createThread(
  tenantId: string,
  resourceType: string,
  resourceId: string,
  title?: string,
  createdBy?: string
): Promise<CollaborationThread> {
  const db = coreDb();
  const now = new Date().toISOString();
  const threadId = crypto.randomUUID();

  const thread: CollaborationThread = {
    id: threadId,
    tenantId,
    resourceType,
    resourceId,
    title,
    createdBy,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };

  await db
    .prepare(
      `INSERT INTO collaboration_threads
       (id, tenant_id, resource_type, resource_id, title, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      threadId,
      tenantId,
      resourceType,
      resourceId,
      title || null,
      createdBy || null,
      now,
      now
    )
    .run();

  return thread;
}

/** Post message to thread */
export async function postMessage(
  tenantId: string,
  threadId: string,
  content: string,
  authorEmail: string,
  authorId?: string,
  mentions?: string[],
  attachments?: string[]
): Promise<CollaborationMessage> {
  const db = coreDb();
  const now = new Date().toISOString();
  const messageId = crypto.randomUUID();

  const message: CollaborationMessage = {
    id: messageId,
    tenantId,
    threadId,
    authorId,
    authorEmail,
    content,
    mentions,
    attachments,
    createdAt: now,
  };

  await db
    .prepare(
      `INSERT INTO collaboration_messages
       (id, tenant_id, thread_id, author_id, author_email, content, mentions, attachments, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      messageId,
      tenantId,
      threadId,
      authorId || null,
      authorEmail,
      content,
      mentions ? JSON.stringify(mentions) : null,
      attachments ? JSON.stringify(attachments) : null,
      now
    )
    .run();

  // Update thread
  await db
    .prepare(
      `UPDATE collaboration_threads
       SET message_count = message_count + 1, updated_at = ?
       WHERE id = ?`
    )
    .bind(now, threadId)
    .run();

  // Handle mentions
  if (mentions && mentions.length > 0) {
    for (const mentionedUser of mentions) {
      await createMention(tenantId, messageId, mentionedUser);
    }
  }

  return message;
}

/** Create mention notification */
async function createMention(
  tenantId: string,
  messageId: string,
  mentionedUser: string
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO collaboration_mentions
       (id, tenant_id, message_id, mentioned_user, read, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`
    )
    .bind(crypto.randomUUID(), tenantId, messageId, mentionedUser, now)
    .run();

  // TODO: Send notification (email, Slack, in-app)
}

/** Get thread with messages */
export async function getThread(
  tenantId: string,
  threadId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{
  thread: CollaborationThread | null;
  messages: CollaborationMessage[];
}> {
  const db = coreDb();

  const thread = await db
    .prepare(
      `SELECT * FROM collaboration_threads WHERE id = ? AND tenant_id = ?`
    )
    .bind(threadId, tenantId)
    .first<Record<string, unknown>>();

  if (!thread) {
    return { thread: null, messages: [] };
  }

  const { results: messages } = await db
    .prepare(
      `SELECT * FROM collaboration_messages
       WHERE thread_id = ?
       ORDER BY created_at ASC
       LIMIT ? OFFSET ?`
    )
    .bind(threadId, limit, offset)
    .all<Record<string, unknown>>();

  return {
    thread: {
      id: String(thread.id),
      tenantId: String(thread.tenant_id),
      resourceType: String(thread.resource_type),
      resourceId: String(thread.resource_id),
      title: thread.title ? String(thread.title) : undefined,
      createdBy: thread.created_by ? String(thread.created_by) : undefined,
      createdAt: String(thread.created_at),
      updatedAt: String(thread.updated_at),
      messageCount: Number(thread.message_count || 0),
    },
    messages: messages.map((m) => ({
      id: String(m.id),
      tenantId: String(m.tenant_id),
      threadId: String(m.thread_id),
      authorId: m.author_id ? String(m.author_id) : undefined,
      authorEmail: String(m.author_email),
      content: String(m.content),
      mentions: m.mentions ? JSON.parse(String(m.mentions)) : undefined,
      attachments: m.attachments ? JSON.parse(String(m.attachments)) : undefined,
      editedAt: m.edited_at ? String(m.edited_at) : undefined,
      createdAt: String(m.created_at),
    })),
  };
}

/** Get resource threads */
export async function getResourceThreads(
  tenantId: string,
  resourceType: string,
  resourceId: string
): Promise<CollaborationThread[]> {
  const db = coreDb();

  const { results: threads } = await db
    .prepare(
      `SELECT * FROM collaboration_threads
       WHERE tenant_id = ? AND resource_type = ? AND resource_id = ?
       ORDER BY updated_at DESC`
    )
    .bind(tenantId, resourceType, resourceId)
    .all<Record<string, unknown>>();

  return threads.map((t) => ({
    id: String(t.id),
    tenantId: String(t.tenant_id),
    resourceType: String(t.resource_type),
    resourceId: String(t.resource_id),
    title: t.title ? String(t.title) : undefined,
    createdBy: t.created_by ? String(t.created_by) : undefined,
    createdAt: String(t.created_at),
    updatedAt: String(t.updated_at),
    messageCount: Number(t.message_count || 0),
  }));
}

/** Create shared note */
export async function createSharedNote(
  tenantId: string,
  title: string,
  content: string,
  ownerId?: string,
  isPublic: boolean = false,
  sharedWith?: string[]
): Promise<SharedNote> {
  const db = coreDb();
  const now = new Date().toISOString();
  const noteId = crypto.randomUUID();

  const note: SharedNote = {
    id: noteId,
    tenantId,
    title,
    content,
    ownerId,
    isPublic,
    sharedWith,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO shared_notes
       (id, tenant_id, title, content, owner_id, is_public, shared_with, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      noteId,
      tenantId,
      title,
      content,
      ownerId || null,
      isPublic ? 1 : 0,
      sharedWith ? JSON.stringify(sharedWith) : null,
      now,
      now
    )
    .run();

  return note;
}

/** Update shared note */
export async function updateSharedNote(
  tenantId: string,
  noteId: string,
  updates: Partial<SharedNote>
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (updates.title) {
    setClauses.push("title = ?");
    values.push(updates.title);
  }
  if (updates.content !== undefined) {
    setClauses.push("content = ?");
    values.push(updates.content);
  }
  if (updates.isPublic !== undefined) {
    setClauses.push("is_public = ?");
    values.push(updates.isPublic ? 1 : 0);
  }
  if (updates.sharedWith !== undefined) {
    setClauses.push("shared_with = ?");
    values.push(updates.sharedWith ? JSON.stringify(updates.sharedWith) : null);
  }

  if (setClauses.length === 0) return;

  setClauses.push("updated_at = ?");
  values.push(now);
  values.push(noteId);
  values.push(tenantId);

  await db
    .prepare(
      `UPDATE shared_notes SET ${setClauses.join(", ")} WHERE id = ? AND tenant_id = ?`
    )
    .bind(...values)
    .run();
}

/** Get tenant's shared notes */
export async function getTenantSharedNotes(
  tenantId: string,
  limit: number = 50,
  offset: number = 0
): Promise<SharedNote[]> {
  const db = coreDb();

  const { results: notes } = await db
    .prepare(
      `SELECT * FROM shared_notes
       WHERE tenant_id = ? AND is_public = 1
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(tenantId, limit, offset)
    .all<Record<string, unknown>>();

  return notes.map((n) => ({
    id: String(n.id),
    tenantId: String(n.tenant_id),
    title: String(n.title),
    content: n.content ? String(n.content) : undefined,
    ownerId: n.owner_id ? String(n.owner_id) : undefined,
    isPublic: Boolean(n.is_public),
    sharedWith: n.shared_with ? JSON.parse(String(n.shared_with)) : undefined,
    createdAt: String(n.created_at),
    updatedAt: String(n.updated_at),
  }));
}

/** Get unread mentions for user */
export async function getUnreadMentions(
  tenantId: string,
  userEmail: string
): Promise<number> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM collaboration_mentions
       WHERE tenant_id = ? AND mentioned_user = ? AND read = 0`
    )
    .bind(tenantId, userEmail)
    .all<{ count: number }>();

  return Number(results[0]?.count || 0);
}
