import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { canAccessChannel, requireChat, tenantChannel, tenantTeam } from "@/lib/chat/access";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChat(request);
    if (user instanceof Response) return user;
    const url = new URL(request.url);
    const channelId = cleanText(url.searchParams.get("channel"), 80);
    const db = coreDb();
    const allMembers = await tenantTeam(user.tenantId);
    if (!channelId) return Response.json({ members: [], allMembers });
    if (!(await canAccessChannel(user, channelId))) return Response.json({ error: "Channel not found." }, { status: 404 });
    const { results: members } = await db.prepare(`
      SELECT tcm.member_email, tcm.role, tcm.joined_at, tm.display_name, tm.role AS workspace_role
      FROM team_chat_channel_members tcm
      LEFT JOIN tenant_members tm ON tm.email=tcm.member_email AND tm.tenant_id=?
      WHERE tcm.channel_id=?
      ORDER BY tcm.role DESC, tm.display_name ASC
    `).bind(user.tenantId, channelId).all<Record<string, unknown>>();
    return Response.json({ members, allMembers });
  } catch (error) {
    console.error("chat.members.get_failed", error);
    return Response.json({ error: "Unable to load members." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChat(request);
    if (user instanceof Response) return user;
    const body = await request.json() as Record<string, unknown>;
    const channelId = cleanText(body.channelId, 80);
    const emails: string[] = Array.isArray(body.emails) ? (body.emails as unknown[]).map(e => cleanText(e, 254).toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) : [];
    if (!channelId || !emails.length) return Response.json({ error: "Channel ID and at least one email are required." }, { status: 400 });
    const db = coreDb();
    const channel = await tenantChannel(user, channelId);
    if (!channel) return Response.json({ error: "Channel not found." }, { status: 404 });
    if (channel.type === "DIRECT") return Response.json({ error: "Direct-message membership cannot be changed." }, { status: 400 });
    const myMembership = await db.prepare("SELECT role FROM team_chat_channel_members WHERE channel_id=? AND member_email=?").bind(channelId, user.email).first<{ role: string }>();
    if (user.role !== "OWNER" && myMembership?.role !== "ADMIN") return Response.json({ error: "Admin access required to add members." }, { status: 403 });
    const placeholders = emails.map(() => "?").join(",");
    const { results: validRows } = await db.prepare(`SELECT email FROM tenant_members WHERE tenant_id=? AND active=1 AND email IN (${placeholders})`).bind(user.tenantId, ...emails).all<{ email: string }>();
    const validEmails = new Set(validRows.map((row) => row.email));
    if (validEmails.size !== new Set(emails).size) return Response.json({ error: "Every channel member must be an active teammate in this company." }, { status: 400 });
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
    const user = await requireChat(request);
    if (user instanceof Response) return user;
    const url = new URL(request.url);
    const channelId = cleanText(url.searchParams.get("channel"), 80);
    const targetEmail = cleanText(url.searchParams.get("email"), 254).toLowerCase();
    if (!channelId || !targetEmail) return Response.json({ error: "Channel ID and email are required." }, { status: 400 });
    const db = coreDb();
    if (!(await tenantChannel(user, channelId, true))) return Response.json({ error: "Channel not found." }, { status: 404 });
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
