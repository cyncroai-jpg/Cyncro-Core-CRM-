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

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChatAccess(request);
    if (!user) return Response.json({ error: "CRM access is required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const channelId = cleanText(body.channelId, 80);
    if (!channelId) return Response.json({ error: "Channel ID is required." }, { status: 400 });
    const db = coreDb();
    const now = new Date().toISOString();
    await db.prepare("INSERT OR REPLACE INTO team_chat_reads (channel_id, member_email, last_read_at) VALUES (?,?,?)").bind(channelId, user.email, now).run();
    return Response.json({ marked: true });
  } catch (error) {
    console.error("chat.reads.post_failed", error);
    return Response.json({ error: "Unable to mark as read." }, { status: 500 });
  }
}
