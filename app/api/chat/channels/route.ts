import { cleanText, coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";

type Member = { role: string; active: number; crm_access: number };

async function chatMember(email: string): Promise<Member | null> {
  const db = coreDb();
  if (email === "platform-owner") return { role: "OWNER", active: 1, crm_access: 1 };
  const m = await db.prepare("SELECT role,active,crm_access FROM workspace_members WHERE email=?").bind(email).first<Member>();
  if (!m) {
    const ct = await db.prepare("SELECT COUNT(*) AS c FROM workspace_members").first<{ c: number }>();
    if (!Number(ct?.c || 0)) return { role: "OWNER", active: 1, crm_access: 1 };
  }
  return m;
}

async function requireChatAccess(request: Request) {
  const email = requestUser(request);
  const m = await chatMember(email);
  if (!m || !m.active || !m.crm_access) return null;
  return { email, role: m.role };
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChatAccess(request);
    if (!user) return Response.json({ error: "CRM access is required." }, { status: 403 });
    const db = coreDb();
    // Public channels + private channels where user is a member + direct channels where user is a member
    const { results: channels } = await db.prepare(`
      SELECT c.*, tcm.role AS my_role,
        (SELECT COUNT(*) FROM team_chat_messages m
          WHERE m.channel_id = c.id AND m.deleted_at IS NULL AND m.created_at > COALESCE(
            (SELECT r.last_read_at FROM team_chat_reads r WHERE r.channel_id=c.id AND r.member_email=?), '1970-01-01'
          )) AS unread_count,
        (SELECT m2.body FROM team_chat_messages m2 WHERE m2.channel_id=c.id AND m2.deleted_at IS NULL ORDER BY m2.created_at DESC LIMIT 1) AS last_message,
        (SELECT m2.created_at FROM team_chat_messages m2 WHERE m2.channel_id=c.id AND m2.deleted_at IS NULL ORDER BY m2.created_at DESC LIMIT 1) AS last_message_at,
        (SELECT m2.author_name FROM team_chat_messages m2 WHERE m2.channel_id=c.id AND m2.deleted_at IS NULL ORDER BY m2.created_at DESC LIMIT 1) AS last_message_author
      FROM team_chat_channels c
      LEFT JOIN team_chat_channel_members tcm ON tcm.channel_id=c.id AND tcm.member_email=?
      WHERE c.archived=0 AND (c.type='PUBLIC' OR tcm.member_email=?)
      ORDER BY c.type='DIRECT' DESC, last_message_at DESC NULLS LAST, c.name ASC
    `).bind(user.email, user.email, user.email).all<Record<string, unknown>>();
    return Response.json({ channels });
  } catch (error) {
    console.error("chat.channels.get_failed", error);
    return Response.json({ error: "Unable to load channels." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChatAccess(request);
    if (!user) return Response.json({ error: "CRM access is required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const type = ["PUBLIC", "PRIVATE", "DIRECT"].includes(String(body.type || "PUBLIC")) ? String(body.type) : "PUBLIC";
    const name = cleanText(body.name, 100);
    const description = cleanText(body.description, 300) || null;
    if (!name) return Response.json({ error: "Channel name is required." }, { status: 400 });
    const memberEmails: string[] = Array.isArray(body.memberEmails) ? (body.memberEmails as unknown[]).map(e => cleanText(e, 254).toLowerCase()).filter(Boolean) : [];
    // For DIRECT channels, ensure exactly 2 members and deduplicate
    if (type === "DIRECT") {
      const recipients = [...new Set([user.email, ...memberEmails])];
      if (recipients.length !== 2) return Response.json({ error: "Direct messages require exactly one other recipient." }, { status: 400 });
      // Check if DM channel already exists between these two
      const sorted = recipients.sort();
      const existing = await coreDb().prepare(`
        SELECT c.id FROM team_chat_channels c
        JOIN team_chat_channel_members m1 ON m1.channel_id=c.id AND m1.member_email=?
        JOIN team_chat_channel_members m2 ON m2.channel_id=c.id AND m2.member_email=?
        WHERE c.type='DIRECT' AND c.archived=0
        LIMIT 1
      `).bind(sorted[0], sorted[1]).first<{ id: string }>();
      if (existing) return Response.json({ channel: { id: existing.id, type: "DIRECT", name, existing: true } });
    }
    const db = coreDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO team_chat_channels (id,name,type,description,created_by,archived,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)").bind(id, name, type, description, user.email, now, now).run();
    // Add creator as ADMIN member
    const allMembers = type === "DIRECT" ? [...new Set([user.email, ...memberEmails])] : [user.email, ...memberEmails.filter(e => e !== user.email)];
    for (const email of allMembers) {
      const role = email === user.email ? "ADMIN" : "MEMBER";
      await db.prepare("INSERT OR IGNORE INTO team_chat_channel_members (id,channel_id,member_email,role,joined_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), id, email, role, now).run();
    }
    return Response.json({ channel: { id, name, type, description } });
  } catch (error) {
    console.error("chat.channels.post_failed", error);
    return Response.json({ error: "Unable to create channel." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChatAccess(request);
    if (!user) return Response.json({ error: "CRM access is required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Channel ID is required." }, { status: 400 });
    const db = coreDb();
    const channel = await db.prepare("SELECT * FROM team_chat_channels WHERE id=?").bind(id).first<Record<string, unknown>>();
    if (!channel) return Response.json({ error: "Channel not found." }, { status: 404 });
    // Must be workspace owner, or channel admin
    const myMembership = await db.prepare("SELECT role FROM team_chat_channel_members WHERE channel_id=? AND member_email=?").bind(id, user.email).first<{ role: string }>();
    if (user.role !== "OWNER" && myMembership?.role !== "ADMIN") return Response.json({ error: "Admin access required." }, { status: 403 });
    const updates: string[] = [];
    const vals: unknown[] = [];
    if (body.name !== undefined) { updates.push("name=?"); vals.push(cleanText(body.name, 100)); }
    if (body.description !== undefined) { updates.push("description=?"); vals.push(cleanText(body.description, 300) || null); }
    if (body.archived !== undefined) { updates.push("archived=?"); vals.push(body.archived ? 1 : 0); }
    if (!updates.length) return Response.json({ updated: false });
    updates.push("updated_at=?"); vals.push(new Date().toISOString());
    vals.push(id);
    await db.prepare(`UPDATE team_chat_channels SET ${updates.join(",")} WHERE id=?`).bind(...vals).run();
    return Response.json({ updated: true });
  } catch (error) {
    console.error("chat.channels.patch_failed", error);
    return Response.json({ error: "Unable to update channel." }, { status: 500 });
  }
}
