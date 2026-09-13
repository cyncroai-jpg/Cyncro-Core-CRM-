import { cleanText, coreDb, ensureCoreSchema, normalizeEmail } from "@/lib/core/db";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const url = new URL(request.url);
    const eventTypeId = cleanText(url.searchParams.get("eventTypeId"), 80);
    const status = cleanText(url.searchParams.get("status"), 30).toUpperCase() || "WAITING";
    let query = "SELECT w.*, e.name AS event_name FROM calendar_waitlist w JOIN calendar_event_types e ON e.id = w.event_type_id WHERE 1=1";
    const params: unknown[] = [];
    if (eventTypeId) { query += " AND w.event_type_id = ?"; params.push(eventTypeId); }
    if (status) { query += " AND w.status = ?"; params.push(status); }
    query += " ORDER BY w.created_at ASC LIMIT 100";
    const { results } = await coreDb().prepare(query).bind(...params).all();
    return Response.json({ waitlist: results });
  } catch (error) {
    console.error("calendar.waitlist.list_failed", error);
    return Response.json({ error: "Unable to load waitlist." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const eventTypeId = cleanText(body.eventTypeId, 80);
    const customerName = cleanText(body.customerName, 160);
    const customerEmail = normalizeEmail(body.customerEmail);
    if (!eventTypeId || !customerName || !customerEmail)
      return Response.json({ error: "Event type, name, and email are required." }, { status: 400 });
    const db = coreDb();
    const eventType = await db.prepare("SELECT id FROM calendar_event_types WHERE id = ? AND active = 1").bind(eventTypeId).first();
    if (!eventType) return Response.json({ error: "Event type not found." }, { status: 404 });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO calendar_waitlist (id, event_type_id, preferred_date, preferred_time_start, preferred_time_end, customer_name, customer_email, customer_phone, notes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'WAITING', ?, ?)`
    ).bind(id, eventTypeId,
      cleanText(body.preferredDate, 20) || null,
      cleanText(body.preferredTimeStart, 10) || null,
      cleanText(body.preferredTimeEnd, 10) || null,
      customerName, customerEmail,
      cleanText(body.customerPhone, 40) || null,
      cleanText(body.notes, 500) || null,
      now, now
    ).run();
    return Response.json({ id, status: "WAITING" }, { status: 201 });
  } catch (error) {
    console.error("calendar.waitlist.create_failed", error);
    return Response.json({ error: "Unable to join waitlist." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Waitlist entry id is required." }, { status: 400 });
    const status = cleanText(body.status, 30).toUpperCase();
    const allowed = new Set(["WAITING", "NOTIFIED", "BOOKED", "CANCELLED"]);
    if (!allowed.has(status)) return Response.json({ error: "Invalid status." }, { status: 400 });
    const now = new Date().toISOString();
    await coreDb().prepare(
      `UPDATE calendar_waitlist SET status = ?, notified_at = CASE WHEN ? = 'NOTIFIED' THEN ? ELSE notified_at END,
       booking_id = COALESCE(?, booking_id), updated_at = ? WHERE id = ?`
    ).bind(status, status, now, cleanText(body.bookingId, 80) || null, now, id).run();
    const entry = await coreDb().prepare("SELECT * FROM calendar_waitlist WHERE id = ?").bind(id).first();
    return entry ? Response.json({ entry }) : Response.json({ error: "Entry not found." }, { status: 404 });
  } catch (error) {
    console.error("calendar.waitlist.update_failed", error);
    return Response.json({ error: "Unable to update waitlist entry." }, { status: 500 });
  }
}
