import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { canAccessChannel, requireChat, tenantChannel, tenantTeam } from "@/lib/chat/access";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChat(request);
    if (user instanceof Response) return user;
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
        AND c.tenant_id = ?
        AND c.archived = 0
        AND m.body LIKE ?
        AND (
          c.type = 'PUBLIC'
          OR EXISTS (SELECT 1 FROM team_chat_channel_members tcm WHERE tcm.channel_id=c.id AND tcm.member_email=?)
          OR ? = 'OWNER'
        )
      ORDER BY m.created_at DESC
      LIMIT 40
    `).bind(user.tenantId, `%${q}%`, user.email, user.role).all<Record<string, unknown>>();
    return Response.json({ results });
  } catch (error) {
    console.error("chat.search.get_failed", error);
    return Response.json({ error: "Search failed." }, { status: 500 });
  }
}
