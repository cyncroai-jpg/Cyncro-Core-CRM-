import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { canAccessChannel, requireChat, tenantChannel, tenantTeam } from "@/lib/chat/access";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChat(request);
    if (user instanceof Response) return user;
    const body = await request.json() as Record<string, unknown>;
    const channelId = cleanText(body.channelId, 80);
    if (!channelId) return Response.json({ error: "Channel ID is required." }, { status: 400 });
    const db = coreDb();
    if (!(await canAccessChannel(user, channelId))) return Response.json({ error: "Channel not found." }, { status: 404 });
    const now = new Date().toISOString();
    await db.prepare("INSERT OR REPLACE INTO team_chat_reads (channel_id, member_email, last_read_at) VALUES (?,?,?)").bind(channelId, user.email, now).run();
    return Response.json({ marked: true });
  } catch (error) {
    console.error("chat.reads.post_failed", error);
    return Response.json({ error: "Unable to mark as read." }, { status: 500 });
  }
}
