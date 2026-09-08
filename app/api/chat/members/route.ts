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
    const url = new URL(request.url);
    const channelId = cleanText(url.searchParams.get("channel"), 80);
    const db = coreDb();
    const { results: allMembers } = await db.prepare("SELECT email, display_name, role FROM workspace_members WHERE active=1 AND crm_access=1 ORDER BY display_name").all<Record<string, unknown>>();
    if (!channelId) return Response.json({ members: [], allMembers });
    const channel = await db.prepare("SELECT type FROM team_chat_channels WHERE id=? AND archived=0").bind(channelId).first<{ type: string }>();
    if (!channel) return Response.json({ error: "Channel not found." }, { status: 404 });
    if (channel.type !== "PUBLIC") {
      const mem = await db.prepare("SELECT 1 FROM team_chat_channel_members WHERE channel_id=? AND member_email=?").bind(channelId, user.email).first();
      if (!mem && user.role !== "OWNER") return Response.json({ error: "Channel access denied." }, { status: 403 });
    }
    const { results: members } = await db.prepare(`
      SELECT tcm.member_email, tcm.role, tcm.joined_at, wm.display_name, wm.role AS workspace_role
      FROM team_chat_channel_members tcm
      LEFT JOIN workspace_members wm ON wm.email=tcm.member_email
      WHERE tcm.channel_id=?
      ORDER BY tcm.role DESC, wm.display_name ASC
    `).bind(channelId).all<Record<string, unknown>>();
    return Response.json({ members, allMembers });
  } catch (error) {
    console.error("chat.members.get_failed", error);
    return Response.json({ error: "Unable to load members." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChatAccess(request);
    if (!user) return Response.json({ error: "CRM access is required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const channelId = cleanText(body.channelId, 80);
    const emails: string[] = Array.isArray(body.emails) ? (body.emails as unknown[]).map(e => cleanText(e, 254).toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) : [];
    if (!channelId || !emails.length) return Response.json({ error: "Channel ID and at least one email are required." }, { status: 400 });
    const db = coreDb();
    const channel = await db.prepare("SELECT type FROM team_chat_channels WHERE id=? AND archived=0").bind(channelId).first<{ type: string }>();
    if (!channel) return Response.json({ error: "Channel not found." }, { status: 404 });
    if (channel.type === "DIRECT") return Response.json({ error: "Direct-message membership cannot be changed." }, { status: 400 });
    const myMembership = await db.prepare("SELECT role FROM team_chat_channel_members WHERE channel_id=? AND member_email=?").bind(channelId, user.email).first<{ role: string }>();
    if (user.role !== "OWNER" && myMembership?.role !== "ADMIN") return Response.json({ error: "Admin access required to add members." }, { status: 403 });
    const placeholders = emails.map(() => "?").join(",");
    const { results: validRows } = await db.prepare(`SELECT email FROM workspace_members WHERE active=1 AND crm_access=1 AND email IN (${placeholders})`).bind(...emails).all<{ email: string }>();
    const validEmails = new Set(validRows.map((row) => row.email));
    if (validEmails.size !== emails.length) return Response.json({ error: "Every channel member must be an active CRM team member." }, { status: 400 });
    const now = new Date().toISOString();
    for (const email of emails) {
      await db.prepare("INSERT OR IGNORE INTO team_chat_channel_members (id,channel_id,member_email,role,joined_at) VALUES (?,?,?,'MEMBER',?)").bind(crypto.randomUUID(), channelId, email, now).run();
    }
    return Response.json({ added: emails.length });
  } catch (error) {
    console.error("chat.members.post_failed", error);
    return Response.json({ error: "Unable to add members." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChatAccess(request);
    if (!user) return Response.json({ error: "CRM access is required." }, { status: 403 });
    const url = new URL(request.url);
    const channelId = cleanText(url.searchParams.get("channel"), 80);
    const targetEmail = cleanText(url.searchParams.get("email"), 254).toLowerCase();
    if (!channelId || !targetEmail) return Response.json({ error: "Channel ID and email are required." }, { status: 400 });
    const db = coreDb();
    // Users can remove themselves, or admins/owners can remove others
    if (targetEmail !== user.email) {
      const myMembership = await db.prepare("SELECT role FROM team_chat_channel_members WHERE channel_id=? AND member_email=?").bind(channelId, user.email).first<{ role: string }>();
      if (user.role !== "OWNER" && myMembership?.role !== "ADMIN") return Response.json({ error: "Admin access required to remove members." }, { status: 403 });
    }
    await db.prepare("DELETE FROM team_chat_channel_members WHERE channel_id=? AND member_email=?").bind(channelId, targetEmail).run();
    return Response.json({ removed: true });
  } catch (error) {
    console.error("chat.members.delete_failed", error);
    return Response.json({ error: "Unable to remove member." }, { status: 500 });
  }
}
