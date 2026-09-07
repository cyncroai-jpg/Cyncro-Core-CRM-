import { cleanText, coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";

type Member = { role: string; active: number; crm_access: number };

async function requireChatAccess(request: Request) {
  const email = requestUser(request);
  if (email === "platform-owner") return { email, role: "OWNER" };
  const db = coreDb();
  const m = await db.prepare("SELECT role,active,crm_access FROM workspace_members WHERE email=?").bind(email).first<Member>();
  if (!m) {
    const ct = await db.prepare("SELECT COUNT(*) AS c FROM workspace_members").first<{ c: number }>();
    if (!Number(ct?.c || 0)) return { email, role: "OWNER" };
    return null;
  }
  if (!m.active || !m.crm_access) return null;
  return { email, role: m.role };
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChatAccess(request);
    if (!user) return Response.json({ error: "CRM access is required." }, { status: 403 });
    const url = new URL(request.url);
    const q = cleanText(url.searchParams.get("q"), 200);
    if (!q || q.length < 2) return Response.json({ results: [] });
    const db = coreDb();
    // Search in channels accessible to the user
    const { results } = await db.prepare(`
      SELECT m.id, m.channel_id, m.author_name, m.body, m.created_at,
             c.name AS channel_name, c.type AS channel_type
      FROM team_chat_messages m
      JOIN team_chat_channels c ON c.id = m.channel_id
      WHERE m.deleted_at IS NULL
        AND c.archived = 0
        AND m.body LIKE ?
        AND (
          c.type = 'PUBLIC'
          OR EXISTS (SELECT 1 FROM team_chat_channel_members tcm WHERE tcm.channel_id=c.id AND tcm.member_email=?)
          OR ? = 'OWNER'
        )
      ORDER BY m.created_at DESC
      LIMIT 40
    `).bind(`%${q}%`, user.email, user.role).all<Record<string, unknown>>();
    return Response.json({ results });
  } catch (error) {
    console.error("chat.search.get_failed", error);
    return Response.json({ error: "Search failed." }, { status: 500 });
  }
}
