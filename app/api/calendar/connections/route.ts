import { cleanText, coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const owner = requestUser(request);
    const feed = await coreDb().prepare("SELECT token FROM calendar_feeds WHERE owner=?").bind(owner).first<{token:string}>();
    return Response.json({ connected: Boolean(feed), feedUrl: feed ? `${new URL(request.url).origin}/api/calendar/feed?token=${feed.token}` : null });
  } catch (error) {
    console.error("calendar.connections.load_failed", error);
    return Response.json({ error: "Unable to load calendar connection." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const owner = requestUser(request); const now = new Date().toISOString();
    const existing = await coreDb().prepare("SELECT token FROM calendar_feeds WHERE owner=?").bind(owner).first<{token:string}>();
    const token = existing?.token || `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-","");
    if (!existing) await coreDb().prepare("INSERT INTO calendar_feeds (id,owner,token,created_at,updated_at) VALUES (?,?,?,?,?)")
      .bind(crypto.randomUUID(),owner,token,now,now).run();
    return Response.json({ connected: true, feedUrl: `${new URL(request.url).origin}/api/calendar/feed?token=${token}` });
  } catch (error) {
    console.error("calendar.connections.create_failed", error);
    return Response.json({ error: "Unable to create calendar connection." }, { status: 500 });
  }
}
