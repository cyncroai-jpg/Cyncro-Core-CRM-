import { cleanText, coreDb, ensureCoreSchema, hasModuleAccess, normalizeEmail, requestUser } from "@/lib/core/db";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
    const url = new URL(request.url);
    const from = cleanText(url.searchParams.get("from"), 40) || new Date(0).toISOString();
    const to = cleanText(url.searchParams.get("to"), 40) || new Date("2100-01-01").toISOString();
    const { results } = await coreDb().prepare(`SELECT b.*, e.name AS event_name, e.duration_minutes, c.full_name AS contact_name,
      c.email AS contact_email, c.phone AS contact_phone FROM calendar_bookings b
      JOIN calendar_event_types e ON e.id = b.event_type_id LEFT JOIN crm_contacts c ON c.id = b.contact_id
      WHERE b.starts_at >= ? AND b.starts_at < ? ORDER BY b.starts_at`).bind(from, to).all();
    return Response.json({ bookings: results });
  } catch (error) {
    console.error("calendar.bookings.list_failed", error);
    return Response.json({ error: "Unable to load bookings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const eventTypeId = cleanText(body.eventTypeId, 80);
    const customerName = cleanText(body.customerName, 160);
    const customerEmail = normalizeEmail(body.customerEmail);
    const starts = new Date(String(body.startsAt || ""));
    const timezone = cleanText(body.timezone, 80);
    const locationMode = cleanText(body.locationMode, 30).toUpperCase();
    if (!eventTypeId || !customerName || !customerEmail || Number.isNaN(starts.valueOf()) || !timezone)
      return Response.json({ error: "Event, customer, start time, and timezone are required." }, { status: 400 });
    if (!new Set(["VIDEO", "PHONE", "IN_PERSON"]).has(locationMode))
      return Response.json({ error: "Choose a valid meeting location." }, { status: 400 });
    const meetingAddress = cleanText(body.meetingAddress, 300) || null;
    const videoPlatform = cleanText(body.videoPlatform, 40).toUpperCase() || null;
    if (locationMode === "IN_PERSON" && !meetingAddress)
      return Response.json({ error: "Meeting address is required for in-person bookings." }, { status: 400 });
    if (locationMode === "VIDEO" && !new Set(["GOOGLE_MEET", "ZOOM", "FACETIME"]).has(videoPlatform || ""))
      return Response.json({ error: "Choose Google Meet, Zoom, or FaceTime." }, { status: 400 });
    const db = coreDb();
    const eventType = await db.prepare("SELECT * FROM calendar_event_types WHERE id = ? AND active = 1").bind(eventTypeId).first<Record<string, unknown>>();
    if (!eventType) return Response.json({ error: "Event type not found." }, { status: 404 });
    const ends = new Date(starts.getTime() + Number(eventType.duration_minutes) * 60_000);
    const conflict = await db.prepare(`SELECT COUNT(*) AS total FROM calendar_bookings
      WHERE event_type_id = ? AND status IN ('CONFIRMED','RESCHEDULED') AND starts_at < ? AND ends_at > ?`)
      .bind(eventTypeId, ends.toISOString(), starts.toISOString()).first<{ total: number }>();
    if (Number(conflict?.total || 0) >= Number(eventType.capacity || 1))
      return Response.json({ error: "That time is no longer available." }, { status: 409 });
    const now = new Date().toISOString();
    const bookingId = crypto.randomUUID();
    await db.prepare(`INSERT INTO calendar_bookings
      (id, event_type_id, account_id, contact_id, customer_name, customer_email, customer_phone, starts_at, ends_at, timezone,
       location_mode, meeting_address, video_platform, video_url, status, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?)`)
      .bind(bookingId, eventTypeId, cleanText(body.accountId, 80) || null, cleanText(body.contactId, 80) || null,
        customerName, customerEmail, cleanText(body.customerPhone, 40) || null, starts.toISOString(), ends.toISOString(), timezone,
        locationMode, meetingAddress, videoPlatform, cleanText(body.videoUrl, 500) || null, cleanText(body.notes, 5000) || null,
        requestUser(request), now, now).run();
    return Response.json({ booking: { id: bookingId, startsAt: starts.toISOString(), endsAt: ends.toISOString(), status: "CONFIRMED" } }, { status: 201 });
  } catch (error) {
    console.error("calendar.bookings.create_failed", error);
    return Response.json({ error: "Unable to create booking." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    const action = cleanText(body.action, 30).toUpperCase();
    if (!id) return Response.json({ error: "Booking id is required." }, { status: 400 });
    const db = coreDb();
    const booking = await db.prepare(`SELECT b.*, e.duration_minutes, e.capacity FROM calendar_bookings b
      JOIN calendar_event_types e ON e.id = b.event_type_id WHERE b.id = ?`).bind(id).first<Record<string, unknown>>();
    if (!booking) return Response.json({ error: "Booking not found." }, { status: 404 });
    const now = new Date().toISOString();
    if (action === "CANCEL") {
      await db.prepare("UPDATE calendar_bookings SET status = 'CANCELLED', updated_at = ? WHERE id = ?")
        .bind(now, id).run();
    } else if (action === "RESCHEDULE") {
      const starts = new Date(String(body.startsAt || ""));
      if (Number.isNaN(starts.valueOf())) return Response.json({ error: "A valid new start time is required." }, { status: 400 });
      const ends = new Date(starts.getTime() + Number(booking.duration_minutes) * 60_000);
      const conflict = await db.prepare(`SELECT COUNT(*) AS total FROM calendar_bookings
        WHERE id <> ? AND event_type_id = ? AND status IN ('CONFIRMED','RESCHEDULED') AND starts_at < ? AND ends_at > ?`)
        .bind(id, booking.event_type_id, ends.toISOString(), starts.toISOString()).first<{ total: number }>();
      if (Number(conflict?.total || 0) >= Number(booking.capacity || 1))
        return Response.json({ error: "That time is no longer available." }, { status: 409 });
      await db.prepare("UPDATE calendar_bookings SET starts_at = ?, ends_at = ?, status = 'RESCHEDULED', updated_at = ? WHERE id = ?")
        .bind(starts.toISOString(), ends.toISOString(), now, id).run();
    } else {
      const status = cleanText(body.status, 30).toUpperCase();
      const allowed = new Set(["CONFIRMED", "COMPLETED", "NO_SHOW"]);
      if (!allowed.has(status)) return Response.json({ error: "Choose a valid booking action." }, { status: 400 });
      await db.prepare("UPDATE calendar_bookings SET status = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?")
        .bind(status, cleanText(body.notes, 5000) || null, now, id).run();
    }
    const updated = await db.prepare("SELECT * FROM calendar_bookings WHERE id = ?").bind(id).first();
    return Response.json({ booking: updated });
  } catch (error) {
    console.error("calendar.bookings.update_failed", error);
    return Response.json({ error: "Unable to update booking." }, { status: 500 });
  }
}
