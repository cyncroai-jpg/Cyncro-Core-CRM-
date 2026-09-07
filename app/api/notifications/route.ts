import { cleanText, coreDb, ensureCoreSchema, hasModuleAccess, requestUser } from "@/lib/core/db";

async function checkAccess(request: Request): Promise<boolean> {
  return (await hasModuleAccess(request, "crm")) || (await hasModuleAccess(request, "calendar"));
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await checkAccess(request))) return Response.json({ error: "Access required." }, { status: 403 });
    const url = new URL(request.url);
    const recipient = cleanText(url.searchParams.get("recipient"), 160) || requestUser(request);
    const { results } = recipient
      ? await coreDb().prepare("SELECT * FROM workspace_notifications WHERE recipient=? ORDER BY created_at DESC LIMIT 50").bind(recipient).all()
      : await coreDb().prepare("SELECT * FROM workspace_notifications ORDER BY created_at DESC LIMIT 50").all();
    return Response.json({ notifications: results });
  } catch (error) {
    console.error("notifications.list_failed", error);
    return Response.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await checkAccess(request))) return Response.json({ error: "Access required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Notification id is required." }, { status: 400 });
    await coreDb().prepare("UPDATE workspace_notifications SET read_at=? WHERE id=?").bind(new Date().toISOString(), id).run();
    return Response.json({ saved: true });
  } catch (error) {
    console.error("notifications.update_failed", error);
    return Response.json({ error: "Unable to update notification." }, { status: 500 });
  }
}
