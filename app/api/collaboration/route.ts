/**
 * Team Collaboration API
 *
 * POST /api/collaboration/threads — create thread on resource
 * GET /api/collaboration/threads — get threads for resource
 * POST /api/collaboration/messages — post message to thread
 * GET /api/collaboration/messages — get messages from thread
 * GET /api/collaboration/mentions — get unread mentions
 * POST /api/collaboration/notes — create shared note
 * GET /api/collaboration/notes — list shared notes
 */

import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  createThread,
  postMessage,
  getThread,
  getResourceThreads,
  createSharedNote,
  updateSharedNote,
  getTenantSharedNotes,
  getUnreadMentions,
} from "@/lib/core/collaboration";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3]; // /api/collaboration/[section]

    if (section === "threads") {
      // GET /api/collaboration/threads?resourceType=contact&resourceId=X
      const resourceType = cleanText(url.searchParams.get("resourceType"), 50);
      const resourceId = cleanText(url.searchParams.get("resourceId"), 80);

      if (!resourceType || !resourceId) {
        return Response.json(
          { error: "resourceType and resourceId are required" },
          { status: 400 }
        );
      }

      const threads = await getResourceThreads(tenant.tenantId, resourceType, resourceId);
      return Response.json({ threads });
    }

    if (section === "messages") {
      // GET /api/collaboration/messages?threadId=X
      const threadId = cleanText(url.searchParams.get("threadId"), 80);
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);

      if (!threadId) {
        return Response.json({ error: "threadId is required" }, { status: 400 });
      }

      const result = await getThread(tenant.tenantId, threadId, limit, offset);
      return Response.json(result);
    }

    if (section === "mentions") {
      // GET /api/collaboration/mentions
      const unreadCount = await getUnreadMentions(tenant.tenantId, tenant.email);
      return Response.json({ unreadCount });
    }

    if (section === "notes") {
      // GET /api/collaboration/notes
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);

      const notes = await getTenantSharedNotes(tenant.tenantId, limit, offset);
      return Response.json({ notes, limit, offset });
    }

    return Response.json({ error: "Unknown endpoint" }, { status: 404 });
  } catch (error) {
    console.error("collaboration.get.failed", error);
    return Response.json(
      { error: "Unable to load collaboration data" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "threads") {
      // POST /api/collaboration/threads
      const resourceType = cleanText(String(body.resourceType || ""), 50);
      const resourceId = cleanText(String(body.resourceId || ""), 80);
      const title = body.title ? cleanText(String(body.title), 160) : undefined;

      if (!resourceType || !resourceId) {
        return Response.json(
          { error: "resourceType and resourceId are required" },
          { status: 400 }
        );
      }

      const thread = await createThread(
        tenant.tenantId,
        resourceType,
        resourceId,
        title,
        tenant.email
      );

      return Response.json(thread, { status: 201 });
    }

    if (section === "messages") {
      // POST /api/collaboration/messages
      const threadId = cleanText(String(body.threadId || ""), 80);
      const content = cleanText(String(body.content || ""), 5000);
      const mentions = Array.isArray(body.mentions) ? (body.mentions as string[]) : [];

      if (!threadId || !content) {
        return Response.json(
          { error: "threadId and content are required" },
          { status: 400 }
        );
      }

      const message = await postMessage(
        tenant.tenantId,
        threadId,
        content,
        tenant.email,
        tenant.userId,
        mentions
      );

      return Response.json(message, { status: 201 });
    }

    if (section === "notes") {
      // POST /api/collaboration/notes
      const title = cleanText(String(body.title || ""), 160);
      const content = cleanText(String(body.content || ""), 10000);
      const isPublic = Boolean(body.isPublic);
      const sharedWith = Array.isArray(body.sharedWith) ? (body.sharedWith as string[]) : [];

      if (!title) {
        return Response.json({ error: "title is required" }, { status: 400 });
      }

      const note = await createSharedNote(
        tenant.tenantId,
        title,
        content,
        tenant.userId,
        isPublic,
        sharedWith
      );

      return Response.json(note, { status: 201 });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("collaboration.post.failed", error);
    return Response.json(
      { error: "Unable to create collaboration item" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3];
    const body = (await request.json()) as Record<string, unknown>;

    if (section === "notes") {
      // PATCH /api/collaboration/notes
      const noteId = cleanText(String(body.id || ""), 80);

      if (!noteId) {
        return Response.json({ error: "id is required" }, { status: 400 });
      }

      const updates: Record<string, unknown> = {};
      if (body.title) updates.title = cleanText(String(body.title), 160);
      if (body.content !== undefined) updates.content = cleanText(String(body.content), 10000);
      if (body.isPublic !== undefined) updates.isPublic = Boolean(body.isPublic);
      if (Array.isArray(body.sharedWith)) updates.sharedWith = body.sharedWith;

      await updateSharedNote(tenant.tenantId, noteId, updates as any);

      return Response.json({ success: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("collaboration.patch.failed", error);
    return Response.json(
      { error: "Unable to update collaboration item" },
      { status: 500 }
    );
  }
}
