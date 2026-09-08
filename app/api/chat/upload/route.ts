import { env } from "cloudflare:workers";
import { cleanText, coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";

type Bucket = { put: (k: string, v: ArrayBuffer, o?: unknown) => Promise<unknown>; get: (k: string) => Promise<{ body: BodyInit; httpMetadata?: { contentType?: string } } | null>; delete: (k: string) => Promise<void> };
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

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "text/plain", "text/csv", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "video/mp4", "video/webm", "audio/mpeg", "audio/wav", "audio/ogg"]);
const MAX_SIZE = 25_000_000; // 25MB

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChatAccess(request);
    if (!user) return Response.json({ error: "CRM access is required." }, { status: 403 });
    const bucket = (env as unknown as { BUCKET?: Bucket }).BUCKET;
    if (!bucket) return Response.json({ error: "File storage is not connected." }, { status: 503 });
    const data = await request.formData();
    const file = data.get("file");
    const channelId = cleanText(data.get("channelId"), 80);
    if (!(file instanceof File) || !channelId) return Response.json({ error: "File and channel ID are required." }, { status: 400 });
    if (file.size > MAX_SIZE) return Response.json({ error: "Files must be 25MB or smaller." }, { status: 400 });
    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(contentType)) return Response.json({ error: "File type not allowed." }, { status: 400 });
    // Verify channel access
    const db = coreDb();
    const channel = await db.prepare("SELECT type FROM team_chat_channels WHERE id=? AND archived=0").bind(channelId).first<{ type: string }>();
    if (!channel) return Response.json({ error: "Channel not found." }, { status: 404 });
    if (channel.type !== "PUBLIC") {
      const mem = await db.prepare("SELECT 1 FROM team_chat_channel_members WHERE channel_id=? AND member_email=?").bind(channelId, user.email).first();
      if (!mem && user.role !== "OWNER") return Response.json({ error: "Channel access denied." }, { status: 403 });
    }
    const id = crypto.randomUUID();
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 200);
    const key = `chat/${channelId}/${id}-${safe}`;
    await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType } });
    return Response.json({ uploaded: true, id, key, filename: file.name, contentType, sizeBytes: file.size });
  } catch (error) {
    console.error("chat.upload.post_failed", error);
    return Response.json({ error: "File upload failed." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChatAccess(request);
    if (!user) return Response.json({ error: "CRM access is required." }, { status: 403 });
    const url = new URL(request.url);
    const key = cleanText(url.searchParams.get("key"), 500);
    if (!key || !key.startsWith("chat/")) return Response.json({ error: "Invalid file key." }, { status: 400 });
    // Extract channel ID from key: chat/{channelId}/{filename}
    const channelId = key.split("/")[1];
    const db = coreDb();
    const channel = await db.prepare("SELECT type FROM team_chat_channels WHERE id=?").bind(channelId).first<{ type: string }>();
    if (!channel) return Response.json({ error: "Channel not found." }, { status: 404 });
    if (channel.type !== "PUBLIC") {
      const mem = await db.prepare("SELECT 1 FROM team_chat_channel_members WHERE channel_id=? AND member_email=?").bind(channelId, user.email).first();
      if (!mem && user.role !== "OWNER") return Response.json({ error: "Access denied." }, { status: 403 });
    }
    const bucket = (env as unknown as { BUCKET?: Bucket }).BUCKET;
    if (!bucket) return Response.json({ error: "File storage not connected." }, { status: 503 });
    const obj = await bucket.get(key);
    if (!obj) return Response.json({ error: "File not found." }, { status: 404 });
    const filename = key.split("/").pop() || "file";
    return new Response(obj.body, {
      headers: {
        "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${filename.replace(/"/g, "").slice(40)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("chat.upload.get_failed", error);
    return Response.json({ error: "File could not be retrieved." }, { status: 500 });
  }
}
