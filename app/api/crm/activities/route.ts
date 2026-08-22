import { cleanText, coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const url = new URL(request.url); const contactId = cleanText(url.searchParams.get("contactId"), 80);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 30)));
    const db = coreDb();
    const statement = contactId
      ? db.prepare(`SELECT x.*, c.full_name AS contact_name FROM crm_activities x JOIN crm_contacts c ON c.id=x.contact_id WHERE x.contact_id=? ORDER BY x.created_at DESC LIMIT ?`).bind(contactId, limit)
      : db.prepare(`SELECT x.*, c.full_name AS contact_name FROM crm_activities x JOIN crm_contacts c ON c.id=x.contact_id ORDER BY x.created_at DESC LIMIT ?`).bind(limit);
    const { results } = await statement.all();
    return Response.json({ activities: results });
  } catch (error) { console.error("crm.activities.list_failed", error); return Response.json({ error: "Unable to load contact activity." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema(); const body = await request.json() as Record<string, unknown>;
    const contactId = cleanText(body.contactId, 80); const activityType = cleanText(body.activityType, 30).toUpperCase();
    const title = cleanText(body.title, 240); if (!contactId || !activityType || !title) return Response.json({ error: "Contact, activity type, and title are required." }, { status: 400 });
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    await coreDb().prepare(`INSERT INTO crm_activities (id,contact_id,activity_type,title,details,due_at,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, contactId, activityType, title, cleanText(body.details, 5000) || null, cleanText(body.dueAt, 60) || null, cleanText(body.status, 30).toUpperCase() || (activityType === "TASK" ? "OPEN" : "COMPLETED"), requestUser(request), now, now).run();
    const activity = await coreDb().prepare("SELECT * FROM crm_activities WHERE id=?").bind(id).first();
    return Response.json({ activity }, { status: 201 });
  } catch (error) { console.error("crm.activities.create_failed", error); return Response.json({ error: "Unable to save contact activity." }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema(); const body = await request.json() as Record<string, unknown>; const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 30).toUpperCase(); if (!id || !status) return Response.json({ error: "Activity id and status are required." }, { status: 400 });
    await coreDb().prepare("UPDATE crm_activities SET status=?, updated_at=? WHERE id=?").bind(status, new Date().toISOString(), id).run();
    return Response.json({ saved: true });
  } catch (error) { console.error("crm.activities.update_failed", error); return Response.json({ error: "Unable to update activity." }, { status: 500 }); }
}
