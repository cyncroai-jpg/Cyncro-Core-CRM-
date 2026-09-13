import { cleanText, coreDb, ensureCoreSchema, normalizeEmail } from "@/lib/core/db";

/** SmartSlot™ temporary hold — reserves a slot for up to 5 minutes */
export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const eventTypeId = cleanText(body.eventTypeId, 80);
    const startsAt = new Date(String(body.startsAt || ""));
    const customerEmail = normalizeEmail(body.customerEmail) || null;
    if (!eventTypeId || Number.isNaN(startsAt.valueOf()))
      return Response.json({ error: "Event type and start time are required." }, { status: 400 });
    const db = coreDb();
    const eventType = await db.prepare("SELECT * FROM calendar_event_types WHERE id = ? AND active = 1").bind(eventTypeId).first<Record<string, unknown>>();
    if (!eventType) return Response.json({ error: "Event type not found." }, { status: 404 });
    const duration = Number(eventType.duration_minutes);
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    // Check for real bookings conflict
    const conflict = await db.prepare(
      `SELECT COUNT(*) AS total FROM calendar_bookings WHERE event_type_id = ? AND status IN ('CONFIRMED','RESCHEDULED') AND starts_at < ? AND ends_at > ?`
    ).bind(eventTypeId, endsAt.toISOString(), startsAt.toISOString()).first<{ total: number }>();
    if (Number(conflict?.total || 0) >= Number(eventType.capacity || 1))
      return Response.json({ error: "That time is no longer available." }, { status: 409 });
    // Clean expired holds
    await db.prepare("DELETE FROM calendar_slot_holds WHERE expires_at < ?").bind(new Date().toISOString()).run();
    // Check for existing active holds
    const held = await db.prepare(
      `SELECT COUNT(*) AS total FROM calendar_slot_holds WHERE event_type_id = ? AND starts_at = ? AND expires_at >= ?`
    ).bind(eventTypeId, startsAt.toISOString(), new Date().toISOString()).first<{ total: number }>();
    if (Number(held?.total || 0) >= Number(eventType.capacity || 1))
      return Response.json({ error: "That slot is currently held. Try again shortly." }, { status: 409 });
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString(); // 5 minutes
    await db.prepare(
      `INSERT INTO calendar_slot_holds (token, event_type_id, starts_at, ends_at, customer_email, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(token, eventTypeId, startsAt.toISOString(), endsAt.toISOString(), customerEmail, expiresAt, new Date().toISOString()).run();
    return Response.json({ token, expiresAt, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }, { status: 201 });
  } catch (error) {
    console.error("calendar.holds.create_failed", error);
    return Response.json({ error: "Unable to create slot hold." }, { status: 500 });
  }
}

/** Release a hold early (user navigated away) */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const token = cleanText(url.searchParams.get("token"), 80);
    if (!token) return Response.json({ error: "Hold token is required." }, { status: 400 });
    await ensureCoreSchema();
    await coreDb().prepare("DELETE FROM calendar_slot_holds WHERE token = ?").bind(token).run();
    return Response.json({ released: true });
  } catch (error) {
    console.error("calendar.holds.delete_failed", error);
    return Response.json({ error: "Unable to release hold." }, { status: 500 });
  }
}

/** Verify a hold is still valid */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = cleanText(url.searchParams.get("token"), 80);
    if (!token) return Response.json({ error: "Hold token is required." }, { status: 400 });
    await ensureCoreSchema();
    const hold = await coreDb().prepare(
      "SELECT * FROM calendar_slot_holds WHERE token = ? AND expires_at > ?"
    ).bind(token, new Date().toISOString()).first();
    if (!hold) return Response.json({ valid: false, error: "Hold has expired or does not exist." }, { status: 404 });
    return Response.json({ valid: true, hold });
  } catch (error) {
    console.error("calendar.holds.check_failed", error);
    return Response.json({ error: "Unable to verify hold." }, { status: 500 });
  }
}
