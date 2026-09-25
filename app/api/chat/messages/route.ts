import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { canAccessChannel, requireChat, tenantChannel, tenantTeam } from "@/lib/chat/access";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChat(request);
    if (user instanceof Response) return user;
    const url = new URL(request.url);
    const channelId = cleanText(url.searchParams.get("channel"), 80);
    const before = cleanText(url.searchParams.get("before"), 40) || null;
    const threadParentId = cleanText(url.searchParams.get("thread"), 80) || null;
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
    if (!channelId) return Response.json({ error: "Channel ID is required." }, { status: 400 });
    if (!(await canAccessChannel(user, channelId))) return Response.json({ error: "Channel access denied." }, { status: 403 });
    const db = coreDb();
    let query: string;
    const params: unknown[] = [];
    if (threadParentId) {
      query = `SELECT * FROM team_chat_messages WHERE channel_id=? AND thread_parent_id=? AND deleted_at IS NULL ORDER BY created_at ASC LIMIT ?`;
      params.push(channelId, threadParentId, limit);
    } else if (before) {
      query = `SELECT * FROM team_chat_messages WHERE channel_id=? AND thread_parent_id IS NULL AND deleted_at IS NULL AND created_at < ? ORDER BY created_at DESC LIMIT ?`;
      params.push(channelId, before, limit);
    } else {
      query = `SELECT * FROM team_chat_messages WHERE channel_id=? AND thread_parent_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?`;
      params.push(channelId, limit);
    }
    const { results: messages } = await db.prepare(query).bind(...params).all<Record<string, unknown>>();
    // Get reply counts for top-level messages
    const ids = messages.map(m => m.id as string).filter(Boolean);
    const replyCounts: Record<string, number> = {};
    if (ids.length && !threadParentId) {
      for (const id of ids) {
        const rc = await db.prepare("SELECT COUNT(*) AS c FROM team_chat_messages WHERE thread_parent_id=? AND deleted_at IS NULL").bind(id).first<{ c: number }>();
        if (rc && rc.c > 0) replyCounts[id] = rc.c;
      }
    }
    const result = messages.map(m => ({ ...m, reply_count: replyCounts[String(m.id)] || 0 }));
    return Response.json({ messages: threadParentId ? result : result.reverse() });
  } catch (error) {
    console.error("chat.messages.get_failed", error);
    return Response.json({ error: "Unable to load messages." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChat(request);
    if (user instanceof Response) return user;
    const body = await request.json() as Record<string, unknown>;
    const channelId = cleanText(body.channelId, 80);
    const rawBody = cleanText(body.body, 4000);
    const threadParentId = cleanText(body.threadParentId, 80) || null;
    const crmLinkType = cleanText(body.crmLinkType, 30) || null;
    const crmLinkId = cleanText(body.crmLinkId, 80) || null;
    const attachments = Array.isArray(body.attachments)
      ? body.attachments.slice(0, 10).flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const attachment = item as Record<string, unknown>;
          const key = cleanText(attachment.key, 500);
          if (!key.startsWith(`chat/${channelId}/`)) return [];
          return [{
            key,
            filename: cleanText(attachment.filename, 240) || "attachment",
            contentType: cleanText(attachment.contentType, 120) || "application/octet-stream",
            sizeBytes: Math.max(0, Math.min(Number(attachment.sizeBytes) || 0, 25_000_000)),
          }];
        })
      : [];
    const attachmentsJson = JSON.stringify(attachments);
    if (!channelId || !rawBody.trim()) return Response.json({ error: "Channel and message body are required." }, { status: 400 });
    if (!(await canAccessChannel(user, channelId))) return Response.json({ error: "Channel access denied." }, { status: 403 });
    // For PUBLIC channels, auto-join if not already a member
    const db = coreDb();
    const channel = await tenantChannel(user, channelId);
    if (channel?.type === "PUBLIC") {
      const now2 = new Date().toISOString();
      await db.prepare("INSERT OR IGNORE INTO team_chat_channel_members (id,channel_id,member_email,role,joined_at) VALUES (?,?,?,'MEMBER',?)").bind(crypto.randomUUID(), channelId, user.email, now2).run();
    }
    if (threadParentId) {
      const parent = await db.prepare("SELECT 1 FROM team_chat_messages WHERE id=? AND channel_id=? AND thread_parent_id IS NULL AND deleted_at IS NULL").bind(threadParentId, channelId).first();
      if (!parent) return Response.json({ error: "The thread is not available in this channel." }, { status: 400 });
    }
    const authorName = user.displayName;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO team_chat_messages (id,channel_id,author_email,author_name,body,thread_parent_id,attachments_json,crm_link_type,crm_link_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id, channelId, user.email, authorName, rawBody.trim(), threadParentId, attachmentsJson, crmLinkType, crmLinkId, now, now).run();
    return Response.json({ message: { id, channel_id: channelId, author_email: user.email, author_name: authorName, body: rawBody.trim(), thread_parent_id: threadParentId, attachments_json: attachmentsJson, crm_link_type: crmLinkType, crm_link_id: crmLinkId, created_at: now, updated_at: now } });
  } catch (error) {
    console.error("chat.messages.post_failed", error);
    return Response.json({ error: "Unable to send message." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChat(request);
    if (user instanceof Response) return user;
    const body = await request.json() as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    const newBody = cleanText(body.body, 4000);
    if (!id || !newBody.trim()) return Response.json({ error: "Message ID and body are required." }, { status: 400 });
    const db = coreDb();
    const msg = await db.prepare("SELECT m.* FROM team_chat_messages m JOIN team_chat_channels c ON c.id=m.channel_id WHERE m.id=? AND m.deleted_at IS NULL AND c.tenant_id=?").bind(id, user.tenantId).first<Record<string, unknown>>();
    if (!msg) return Response.json({ error: "Message not found." }, { status: 404 });
    // Only the author can edit their own messages
    if (msg.author_email !== user.email) return Response.json({ error: "You can only edit your own messages." }, { status: 403 });
    const now = new Date().toISOString();
    await db.prepare("UPDATE team_chat_messages SET body=?,edited_at=?,updated_at=? WHERE id=?").bind(newBody.trim(), now, now, id).run();
    return Response.json({ updated: true, edited_at: now });
  } catch (error) {
    console.error("chat.messages.patch_failed", error);
    return Response.json({ error: "Unable to edit message." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChat(request);
    if (user instanceof Response) return user;
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Message ID is required." }, { status: 400 });
    const db = coreDb();
    const msg = await db.prepare("SELECT m.* FROM team_chat_messages m JOIN team_chat_channels c ON c.id=m.channel_id WHERE m.id=? AND m.deleted_at IS NULL AND c.tenant_id=?").bind(id, user.tenantId).first<Record<string, unknown>>();
    if (!msg) return Response.json({ error: "Message not found." }, { status: 404 });
    // Author can delete own messages; OWNER/channel admin can delete any
    if (msg.author_email !== user.email) {
      const isOwner = user.role === "OWNER";
      const isChannelAdmin = !!(await db.prepare("SELECT 1 FROM team_chat_channel_members WHERE channel_id=? AND member_email=? AND role='ADMIN'").bind(msg.channel_id, user.email).first());
      if (!isOwner && !isChannelAdmin) return Response.json({ error: "You can only delete your own messages." }, { status: 403 });
    }
    const now = new Date().toISOString();
    await db.prepare("UPDATE team_chat_messages SET deleted_at=?,body='[message deleted]',updated_at=? WHERE id=?").bind(now, now, id).run();
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("chat.messages.delete_failed", error);
    return Response.json({ error: "Unable to delete message." }, { status: 500 });
  }
}
