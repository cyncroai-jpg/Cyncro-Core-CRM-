import { cleanText, coreDb, ensureCoreSchema, hasModuleAccess } from "@/lib/core/db";

/** Returns resource bookings joined with resource info and booking customer name, for the calendar view. */
export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
    const url = new URL(request.url);
    const from = cleanText(url.searchParams.get("from"), 40) || new Date(0).toISOString();
    const to = cleanText(url.searchParams.get("to"), 40) || new Date("2100-01-01").toISOString();
    const resourceId = cleanText(url.searchParams.get("resourceId"), 80);
    let query = `SELECT rb.*, r.name AS resource_name, r.resource_type, r.color AS resource_color,
      b.customer_name, b.status AS booking_status, b.event_type_id,
      e.name AS event_name, e.color AS event_color
      FROM calendar_resource_bookings rb
      JOIN calendar_resources r ON r.id = rb.resource_id
      JOIN calendar_bookings b ON b.id = rb.booking_id
      JOIN calendar_event_types e ON e.id = b.event_type_id
      WHERE rb.starts_at < ? AND rb.ends_at > ? AND b.status IN ('CONFIRMED','RESCHEDULED')`;
    const params: unknown[] = [to, from];
    if (resourceId) { query += " AND rb.resource_id = ?"; params.push(resourceId); }
    query += " ORDER BY rb.starts_at";
    const { results } = await coreDb().prepare(query).bind(...params).all();
    return Response.json({ resourceBookings: results });
  } catch (error) {
    console.error("calendar.resource_bookings.list_failed", error);
    return Response.json({ error: "Unable to load resource bookings." }, { status: 500 });
  }
}

/** Manually link/unlink a resource to/from an existing booking. */
export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const bookingId = cleanText(body.bookingId, 80);
    const resourceId = cleanText(body.resourceId, 80);
    if (!bookingId || !resourceId) return Response.json({ error: "bookingId and resourceId are required." }, { status: 400 });
    const db = coreDb();
    const booking = await db.prepare("SELECT starts_at, ends_at FROM calendar_bookings WHERE id = ?").bind(bookingId).first<{starts_at:string;ends_at:string}>();
    if (!booking) return Response.json({ error: "Booking not found." }, { status: 404 });
    // Check for conflict
    const conflict = await db.prepare(
      `SELECT COUNT(*) AS total FROM calendar_resource_bookings WHERE resource_id = ? AND booking_id != ? AND starts_at < ? AND ends_at > ?`
    ).bind(resourceId, bookingId, booking.ends_at, booking.starts_at).first<{total:number}>();
    if (Number(conflict?.total || 0) > 0) return Response.json({ error: "Resource is already booked during that time." }, { status: 409 });
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.prepare(`INSERT OR IGNORE INTO calendar_resource_bookings (id, booking_id, resource_id, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, bookingId, resourceId, booking.starts_at, booking.ends_at, now).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("calendar.resource_bookings.link_failed", error);
    return Response.json({ error: "Unable to link resource." }, { status: 500 });
  }
}

/** Unlink a resource from a booking. */
export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
    const url = new URL(request.url);
    const bookingId = cleanText(url.searchParams.get("bookingId"), 80);
    const resourceId = cleanText(url.searchParams.get("resourceId"), 80);
    if (!bookingId || !resourceId) return Response.json({ error: "bookingId and resourceId are required." }, { status: 400 });
    await coreDb().prepare("DELETE FROM calendar_resource_bookings WHERE booking_id = ? AND resource_id = ?").bind(bookingId, resourceId).run();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("calendar.resource_bookings.unlink_failed", error);
    return Response.json({ error: "Unable to unlink resource." }, { status: 500 });
  }
}
