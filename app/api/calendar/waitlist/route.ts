import { cleanText, coreDb, ensureCoreSchema, normalizeEmail } from "@/lib/core/db";
import { requireTenant, requireTenantAction } from "@/lib/core/tenantAuth";
import { sendEmail, waitlistSlotAvailableEmail, bookingConfirmationEmail } from "@/lib/core/email";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const url = new URL(request.url);
    const eventTypeId = cleanText(url.searchParams.get("eventTypeId"), 80);
    const status = cleanText(url.searchParams.get("status"), 30).toUpperCase() || "WAITING";
    let query = "SELECT w.*, e.name AS event_name FROM calendar_waitlist w JOIN calendar_event_types e ON e.id = w.event_type_id WHERE w.tenant_id = ?";
    const params: unknown[] = [tenant.tenantId];
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
    const eventType = await db.prepare("SELECT id, tenant_id FROM calendar_event_types WHERE id = ? AND active = 1").bind(eventTypeId).first<{id:string; tenant_id:string}>();
    if (!eventType) return Response.json({ error: "Event type not found." }, { status: 404 });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO calendar_waitlist (id, event_type_id, preferred_date, preferred_time_start, preferred_time_end, customer_name, customer_email, customer_phone, notes, status, tenant_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'WAITING', ?, ?, ?)`
    ).bind(id, eventTypeId,
      cleanText(body.preferredDate, 20) || null,
      cleanText(body.preferredTimeStart, 10) || null,
      cleanText(body.preferredTimeEnd, 10) || null,
      customerName, customerEmail,
      cleanText(body.customerPhone, 40) || null,
      cleanText(body.notes, 500) || null,
      eventType.tenant_id, now, now
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
    const tenant = await requireTenantAction(request, "edit");
    if (tenant instanceof Response) return tenant;
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Waitlist entry id is required." }, { status: 400 });
    const status = cleanText(body.status, 30).toUpperCase();
    const allowed = new Set(["WAITING", "NOTIFIED", "BOOKED", "CANCELLED"]);
    if (!allowed.has(status)) return Response.json({ error: "Invalid status." }, { status: 400 });
    const db = coreDb();
    const entry = await db.prepare(
      `SELECT w.*, e.name AS event_name, e.duration_minutes, e.capacity, e.host_name, e.location_modes
       FROM calendar_waitlist w JOIN calendar_event_types e ON e.id = w.event_type_id WHERE w.id = ? AND w.tenant_id = ?`
    ).bind(id, tenant.tenantId).first<Record<string, unknown>>();
    if (!entry) return Response.json({ error: "Entry not found." }, { status: 404 });
    const now = new Date().toISOString();
    let newBookingId: string | null = null;

    // ── NOTIFIED: mark + send slot-available email ──────────────────────────
    if (status === "NOTIFIED") {
      await db.prepare(
        `UPDATE calendar_waitlist SET status = 'NOTIFIED', notified_at = ?, updated_at = ? WHERE id = ?`
      ).bind(now, now, id).run();
      // Fire-and-forget notification email
      try {
        const { subject, html } = waitlistSlotAvailableEmail({
          customerName: String(entry.customer_name),
          eventName: String(entry.event_name || "appointment"),
          bookingUrl: null, // Booking URL would be the public event type link; left for admin to customise
        });
        void sendEmail({ to: String(entry.customer_email), subject, html, tenantId: String(entry.tenant_id || "") || undefined });
      } catch { /* non-fatal */ }
    }

    // ── BOOKED: create a real confirmed booking from the waitlist entry ─────
    else if (status === "BOOKED") {
      const duration = Number(entry.duration_minutes || 30);
      // Use preferred date/time if stored, else book 24h from now as a placeholder
      const preferredDate = String(entry.preferred_date || "");
      const preferredTime = String(entry.preferred_time_start || "09:00");
      let starts: Date;
      if (preferredDate) {
        const [h, m] = preferredTime.split(":").map(Number);
        starts = new Date(`${preferredDate}T${String(isNaN(h) ? 9 : h).padStart(2, "0")}:${String(isNaN(m) ? 0 : m).padStart(2, "0")}:00Z`);
        if (starts.getTime() < Date.now()) starts = new Date(Date.now() + 86_400_000);
      } else {
        starts = new Date(Date.now() + 86_400_000);
      }
      const ends = new Date(starts.getTime() + duration * 60_000);
      const locationModes: string[] = (() => { try { return JSON.parse(String(entry.location_modes || '["VIDEO"]')); } catch { return ["VIDEO"]; } })();
      const locationMode = locationModes[0] || "VIDEO";
      newBookingId = crypto.randomUUID();
      const assignedTo = String(entry.host_name || tenant.email);
      // Upsert contact
      const existing = await db.prepare("SELECT id FROM crm_contacts WHERE lower(email) = lower(?) AND tenant_id = ?").bind(String(entry.customer_email), tenant.tenantId).first<{ id: string }>();
      let contactId: string;
      if (existing) {
        contactId = existing.id;
      } else {
        contactId = crypto.randomUUID();
        await db.prepare(`INSERT INTO crm_contacts (id,full_name,email,phone,lifecycle,source,tenant_id,created_at,updated_at) VALUES (?,?,?,?,'CUSTOMER','CALENDAR',?,?,?)`)
          .bind(contactId, String(entry.customer_name), String(entry.customer_email), String(entry.customer_phone || "") || null, tenant.tenantId, now, now).run();
      }
      await db.prepare(`INSERT INTO calendar_bookings
        (id,event_type_id,contact_id,customer_name,customer_email,customer_phone,starts_at,ends_at,timezone,
         location_mode,status,notes,created_by,assigned_to,tenant_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'CONFIRMED',?,?,?,?,?,?)`)
        .bind(newBookingId, String(entry.event_type_id), contactId,
          String(entry.customer_name), String(entry.customer_email), String(entry.customer_phone || "") || null,
          starts.toISOString(), ends.toISOString(), "UTC",
          locationMode, String(entry.notes || "") || null,
          tenant.email, assignedTo, tenant.tenantId, now, now).run();
      await db.prepare(`UPDATE calendar_waitlist SET status = 'BOOKED', booking_id = ?, updated_at = ? WHERE id = ?`)
        .bind(newBookingId, now, id).run();
      // Confirmation email
      try {
        const { subject, html } = bookingConfirmationEmail({
          customerName: String(entry.customer_name),
          eventName: String(entry.event_name || "appointment"),
          startsAt: starts.toISOString(),
          timezone: "UTC",
          locationMode,
          videoPlatform: null,
          meetingAddress: null,
          assignedTo,
          notes: String(entry.notes || "") || null,
        });
        void sendEmail({ to: String(entry.customer_email), subject, html, tenantId: String(entry.tenant_id || "") || undefined });
      } catch { /* non-fatal */ }
    }

    // ── CANCELLED / WAITING: simple status update ───────────────────────────
    else {
      await db.prepare(`UPDATE calendar_waitlist SET status = ?, updated_at = ? WHERE id = ?`).bind(status, now, id).run();
    }

    const updated = await db.prepare("SELECT * FROM calendar_waitlist WHERE id = ?").bind(id).first();
    return updated
      ? Response.json({ entry: updated, ...(newBookingId ? { bookingId: newBookingId } : {}) })
      : Response.json({ error: "Entry not found." }, { status: 404 });
  } catch (error) {
    console.error("calendar.waitlist.update_failed", error);
    return Response.json({ error: "Unable to update waitlist entry." }, { status: 500 });
  }
}
