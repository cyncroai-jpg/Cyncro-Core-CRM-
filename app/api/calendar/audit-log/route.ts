import { cleanText, coreDb, ensureCoreSchema, hasModuleAccess, requestUser } from "@/lib/core/db";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
    const url = new URL(request.url);
    const entityId = cleanText(url.searchParams.get("entityId"), 80);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
    let query = "SELECT * FROM calendar_audit_log WHERE 1=1";
    const params: unknown[] = [];
    if (entityId) { query += " AND entity_id = ?"; params.push(entityId); }
    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);
    const { results } = await coreDb().prepare(query).bind(...params).all();
    return Response.json({ log: results });
  } catch (error) {
    console.error("calendar.audit_log.list_failed", error);
    return Response.json({ error: "Unable to load audit log." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const entityId = cleanText(body.entityId, 80);
    const entityType = cleanText(body.entityType, 40) || "BOOKING";
    const action = cleanText(body.action, 80);
    if (!entityId || !action) return Response.json({ error: "Entity id and action are required." }, { status: 400 });
    const actor = requestUser(request);
    const id = crypto.randomUUID();
    await coreDb().prepare(
      `INSERT INTO calendar_audit_log (id, booking_id, entity_type, entity_id, action, actor, before_state, after_state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, cleanText(body.bookingId, 80) || null, entityType, entityId, action, actor,
      body.beforeState ? JSON.stringify(body.beforeState) : null,
      body.afterState ? JSON.stringify(body.afterState) : null,
      new Date().toISOString()
    ).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("calendar.audit_log.write_failed", error);
    return Response.json({ error: "Unable to write audit log." }, { status: 500 });
  }
}
