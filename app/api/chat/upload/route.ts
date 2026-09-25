import { env } from "cloudflare:workers";
import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { canAccessChannel, requireChat, tenantChannel, tenantTeam } from "@/lib/chat/access";

type Bucket = { put: (k: string, v: ArrayBuffer, o?: unknown) => Promise<unknown>; get: (k: string) => Promise<{ body: BodyInit; httpMetadata?: { contentType?: string } } | null>; delete: (k: string) => Promise<void> };
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "text/plain", "text/csv", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "video/mp4", "video/webm", "audio/mpeg", "audio/wav", "audio/ogg"]);
const MAX_SIZE = 25_000_000; // 25MB

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await requireChat(request);
    if (user instanceof Response) return user;
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
    if (!(await canAccessChannel(user, channelId))) return Response.json({ error: "Channel not found." }, { status: 404 });
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
    const user = await requireChat(request);
    if (user instanceof Response) return user;
    const url = new URL(request.url);
    const key = cleanText(url.searchParams.get("key"), 500);
    if (!key || !key.startsWith("chat/")) return Response.json({ error: "Invalid file key." }, { status: 400 });
    // Extract channel ID from key: chat/{channelId}/{filename}
    const channelId = key.split("/")[1];
    if (!(await canAccessChannel(user, channelId, true))) return Response.json({ error: "Channel not found." }, { status: 404 });
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
