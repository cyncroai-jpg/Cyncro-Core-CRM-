import { cleanText, coreDb, ensureCoreSchema, normalizeEmail } from "@/lib/core/db";
import { requireTenant, requireTenantAction, tenantForBooking } from "@/lib/core/tenantAuth";
import { emitAutomationEvent } from "@/lib/automations/engine";
import { syncGoogleBooking } from "@/lib/core/google-calendar";
import { sendEmail, bookingConfirmationEmail, bookingCancellationEmail, bookingRescheduleEmail } from "@/lib/core/email";
import { dispatchWebhookEvent } from "@/lib/core/webhooks";

/**
 * Outcome Routing™ executor — resolves who to assign a booking to based on
 * the event type's linked routing rule. Falls back to host_name if no rule
 * is set or no eligible member is available.
 */
async function resolveAssignedTo(
  db: ReturnType<typeof coreDb>,
  eventType: Record<string, unknown>,
  fallback: string,
  leadScore = 0
): Promise<string> {
  const routingRuleId = String(eventType.routing_rule_id || "");
  if (!routingRuleId) return fallback;
  const rule = await db.prepare("SELECT * FROM calendar_routing_rules WHERE id = ? AND active = 1").bind(routingRuleId).first<Record<string, unknown>>();
  if (!rule) return fallback;
  let members: string[] = [];
  try { members = JSON.parse(String(rule.members || "[]")); } catch { /* ignore */ }
  if (!members.length) return fallback;
  const strategy = String(rule.strategy || "ROUND_ROBIN");
  if (strategy === "ROUND_ROBIN") {
    // Pick the member with the fewest bookings in the last 30 days
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    let minBookings = Infinity, chosen = members[0];
    for (const m of members) {
      const row = await db.prepare(
        `SELECT COUNT(*) AS total FROM calendar_bookings WHERE assigned_to = ? AND created_at >= ? AND status IN ('CONFIRMED','RESCHEDULED')`
      ).bind(m, since).first<{ total: number }>();
      if (Number(row?.total || 0) < minBookings) { minBookings = Number(row?.total || 0); chosen = m; }
    }
    return chosen;
  }
  if (strategy === "WEIGHTED") {
    let weights: Record<string, number> = {};
    try { weights = JSON.parse(String(rule.weights || "{}")); } catch { /* ignore */ }
    const total = members.reduce((s, m) => s + (weights[m] || 1), 0);
    let rand = Math.random() * total;
    for (const m of members) { rand -= (weights[m] || 1); if (rand <= 0) return m; }
    return members[members.length - 1];
  }
  if (strategy === "AVAILABILITY") {
    // Pick the member with the most open slots today
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setUTCHours(23, 59, 59, 999);
    let minToday = Infinity, chosen = members[0];
    for (const m of members) {
      const row = await db.prepare(
        `SELECT COUNT(*) AS total FROM calendar_bookings WHERE assigned_to = ? AND starts_at >= ? AND starts_at <= ?`
      ).bind(m, todayStart.toISOString(), todayEnd.toISOString()).first<{ total: number }>();
      if (Number(row?.total || 0) < minToday) { minToday = Number(row?.total || 0); chosen = m; }
    }
    return chosen;
  }
  if (strategy === "PERFORMANCE" || strategy === "REVENUE") {
    // High-lead-score bookings go to the top performer (fewest no-shows in 60 days)
    if (leadScore >= 70) {
      const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
      let minNoShows = Infinity, chosen = members[0];
      for (const m of members) {
        const row = await db.prepare(
          `SELECT COUNT(*) AS total FROM calendar_bookings WHERE assigned_to = ? AND created_at >= ? AND status = 'NO_SHOW'`
        ).bind(m, since).first<{ total: number }>();
        if (Number(row?.total || 0) < minNoShows) { minNoShows = Number(row?.total || 0); chosen = m; }
      }
      return chosen;
    }
    // Standard leads: round-robin
    return members[Math.floor(Math.random() * members.length)];
  }
  // SKILL / TERRITORY: return first member (full impl requires contact metadata lookup)
  return members[0];
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const url = new URL(request.url);
    const from = cleanText(url.searchParams.get("from"), 40) || new Date(0).toISOString();
    const to = cleanText(url.searchParams.get("to"), 40) || new Date("2100-01-01").toISOString();
    const { results } = await coreDb().prepare(`SELECT b.*, e.name AS event_name, e.duration_minutes, c.full_name AS contact_name,
      c.email AS contact_email, c.phone AS contact_phone FROM calendar_bookings b
      JOIN calendar_event_types e ON e.id = b.event_type_id LEFT JOIN crm_contacts c ON c.id = b.contact_id
      WHERE b.tenant_id = ? AND b.starts_at >= ? AND b.starts_at < ? ORDER BY b.starts_at`).bind(tenant.tenantId, from, to).all();
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
    // Customers book from the public link without an account; members book from inside the calendar.
    const tenant = await tenantForBooking(request, { eventTypeId });
    if (tenant instanceof Response) return tenant;
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
    const eventType = await db.prepare("SELECT * FROM calendar_event_types WHERE id = ? AND active = 1 AND tenant_id = ?").bind(eventTypeId, tenant.tenantId).first<Record<string, unknown>>();
    if (!eventType) return Response.json({ error: "Event type not found." }, { status: 404 });
    // Appointment length is owned by the event type. Public bookers cannot override it.
    const duration = Number(eventType.duration_minutes);
    const ends = new Date(starts.getTime() + duration * 60_000);
    const conflict = await db.prepare(`SELECT COUNT(*) AS total FROM calendar_bookings
      WHERE event_type_id = ? AND tenant_id = ? AND status IN ('CONFIRMED','RESCHEDULED') AND starts_at < ? AND ends_at > ?`)
      .bind(eventTypeId, tenant.tenantId, ends.toISOString(), starts.toISOString()).first<{ total: number }>();
    if (Number(conflict?.total || 0) >= Number(eventType.capacity || 1))
      return Response.json({ error: "That time is no longer available." }, { status: 409 });
    const now = new Date().toISOString();
    const bookingId = crypto.randomUUID();
    let contactId = cleanText(body.contactId, 80) || null;
    if (!contactId) {
      const existing = await db.prepare("SELECT id FROM crm_contacts WHERE lower(email)=lower(?) AND tenant_id=?").bind(customerEmail, tenant.tenantId).first<{id:string}>();
      contactId = existing?.id || crypto.randomUUID();
      if (existing) {
        await db.prepare("UPDATE crm_contacts SET full_name=?,phone=COALESCE(?,phone),lifecycle='CUSTOMER',updated_at=? WHERE id=?")
          .bind(customerName, cleanText(body.customerPhone,40)||null, now, contactId).run();
      } else {
        await db.prepare(`INSERT INTO crm_contacts (id,full_name,email,phone,lifecycle,assigned_rep,source,tenant_id,created_at,updated_at)
          VALUES (?,?,?,?, 'CUSTOMER', ?, 'CALENDAR', ?, ?, ?)`).bind(contactId,customerName,customerEmail,cleanText(body.customerPhone,40)||null,String(eventType.host_name||tenant.email),tenant.tenantId,now,now).run();
      }
    }
    const leadScore = Math.min(100, Math.max(0, Number(body.leadScore || 0)));
    // Outcome Routing™: resolve assignedTo via routing rule if set; explicit body value overrides
    const assignedTo = cleanText(body.assignedTo, 160)
      || await resolveAssignedTo(db, eventType, String(eventType.host_name || tenant.email), leadScore);
    const opportunityId = cleanText(body.opportunityId, 80) || null;
    const customAnswers = body.customAnswers && typeof body.customAnswers === "object" ? JSON.stringify(body.customAnswers) : "{}";
    const holdToken = cleanText(body.holdToken, 80) || null;
    await db.prepare(`INSERT INTO calendar_bookings
      (id, event_type_id, account_id, contact_id, customer_name, customer_email, customer_phone, starts_at, ends_at, timezone,
       location_mode, meeting_address, video_platform, video_url, status, notes, created_by, assigned_to,
       opportunity_id, lead_score, custom_answers, hold_token, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(bookingId, eventTypeId, cleanText(body.accountId, 80) || null, contactId,
        customerName, customerEmail, cleanText(body.customerPhone, 40) || null, starts.toISOString(), ends.toISOString(), timezone,
        locationMode, meetingAddress, videoPlatform, cleanText(body.videoUrl, 500) || null, cleanText(body.notes, 5000) || null,
        tenant.email, assignedTo, opportunityId, leadScore, customAnswers, holdToken, tenant.tenantId, now, now).run();
    // Resource bookings — check conflicts then reserve
    const resourceIds: string[] = Array.isArray(body.resourceIds) ? (body.resourceIds as unknown[]).map(String).filter(Boolean) : [];
    if (resourceIds.length > 0) {
      for (const rid of resourceIds) {
        const conflict = await db.prepare(
          `SELECT COUNT(*) AS total FROM calendar_resource_bookings WHERE resource_id = ? AND starts_at < ? AND ends_at > ?`
        ).bind(rid, ends.toISOString(), starts.toISOString()).first<{ total: number }>();
        if (Number(conflict?.total || 0) > 0) {
          // Non-blocking: note conflict in audit but don't reject booking
          console.warn("calendar.resource.conflict", { rid, bookingId });
        } else {
          await db.prepare(`INSERT INTO calendar_resource_bookings (id, booking_id, resource_id, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
            .bind(crypto.randomUUID(), bookingId, rid, starts.toISOString(), ends.toISOString(), now).run();
        }
      }
    }
    await db.prepare(`INSERT INTO crm_activities (id,contact_id,activity_type,title,details,due_at,status,created_by,tenant_id,created_at,updated_at)
      VALUES (?,?, 'CALENDAR', ?, ?, ?, 'COMPLETED', ?, ?, ?, ?)`).bind(crypto.randomUUID(),contactId,`Booked ${String(eventType.name||"appointment")}`,`${locationMode}${videoPlatform?` · ${videoPlatform}`:""}${meetingAddress?` · ${meetingAddress}`:""}`,starts.toISOString(),tenant.email,tenant.tenantId,now,now).run();
    await db.prepare(`INSERT INTO workspace_notifications (id,recipient,title,body,entity_type,entity_id,created_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), assignedTo, "New appointment assigned", `${customerName} · ${starts.toLocaleString()}`, "BOOKING", bookingId, now).run();
    const createdBooking = await db.prepare(`SELECT b.*,e.name AS event_name FROM calendar_bookings b JOIN calendar_event_types e ON e.id=b.event_type_id WHERE b.id=?`).bind(bookingId).first<Record<string,unknown>>();
    if (createdBooking) await syncGoogleBooking(tenant.email, createdBooking);
    // Automation webhooks — fire-and-forget
    await emitAutomationEvent(tenant.tenantId, "BOOKING_CREATED", { contactId, bookingId, customerName, customerEmail, customerPhone: cleanText(body.customerPhone, 40), startsAt: starts.toISOString(), eventName: String(eventType.name || ""), eventTypeId, assignedTo, trigger: "BOOKING_CREATED" });
    void dispatchWebhookEvent("appointment.created", {
      bookingId, eventTypeId, customerName, customerEmail,
      startsAt: starts.toISOString(), endsAt: ends.toISOString(),
      timezone, locationMode, assignedTo, status: "CONFIRMED",
    });
    // Audit log — fire-and-forget
    try {
      await db.prepare(`INSERT INTO calendar_audit_log (id, booking_id, entity_type, entity_id, action, actor, after_state, tenant_id, created_at)
        VALUES (?, ?, 'BOOKING', ?, 'CREATED', ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), bookingId, bookingId, tenant.email,
        JSON.stringify({ startsAt: starts.toISOString(), endsAt: ends.toISOString(), status: "CONFIRMED", assignedTo }), tenant.tenantId, now
      ).run();
      // Release slot hold if token was provided
      if (cleanText(body.holdToken, 80)) await db.prepare("DELETE FROM calendar_slot_holds WHERE token = ?").bind(cleanText(body.holdToken, 80)).run();
    } catch { /* non-fatal */ }
    // Send confirmation email (fire-and-forget)
    try {
      const { subject, html } = bookingConfirmationEmail({
        customerName,
        eventName: String(eventType.name),
        startsAt: starts.toISOString(),
        timezone,
        locationMode,
        videoPlatform,
        meetingAddress,
        assignedTo,
        notes: cleanText(body.notes, 500) || null,
      });
      void sendEmail({ to: customerEmail, subject, html, tenantId: tenant.tenantId });
    } catch { /* non-fatal */ }
    return Response.json({ booking: { id: bookingId, startsAt: starts.toISOString(), endsAt: ends.toISOString(), status: "CONFIRMED" } }, { status: 201 });
  } catch (error) {
    console.error("calendar.bookings.create_failed", error);
    return Response.json({ error: "Unable to create booking." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "edit");
    if (tenant instanceof Response) return tenant;
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    const action = cleanText(body.action, 30).toUpperCase();
    if (!id) return Response.json({ error: "Booking id is required." }, { status: 400 });
    const db = coreDb();
    const booking = await db.prepare(`SELECT b.*, e.duration_minutes, e.capacity FROM calendar_bookings b
      JOIN calendar_event_types e ON e.id = b.event_type_id WHERE b.id = ? AND b.tenant_id = ?`).bind(id, tenant.tenantId).first<Record<string, unknown>>();
    if (!booking) return Response.json({ error: "Booking not found." }, { status: 404 });
    const now = new Date().toISOString();
    if (action === "CANCEL") {
      await db.prepare("UPDATE calendar_bookings SET status = 'CANCELLED', updated_at = ? WHERE id = ?")
        .bind(now, id).run();
      await emitAutomationEvent(tenant.tenantId, "BOOKING_CANCELLED", { contactId: String(booking.contact_id || ""), bookingId: id, customerName: String(booking.customer_name || ""), startsAt: String(booking.starts_at || ""), trigger: "BOOKING_CANCELLED" });
    } else if (action === "RESCHEDULE") {
      const starts = new Date(String(body.startsAt || ""));
      if (Number.isNaN(starts.valueOf())) return Response.json({ error: "A valid new start time is required." }, { status: 400 });
      const originalDuration = Math.max(5, Math.round((new Date(String(booking.ends_at)).getTime() - new Date(String(booking.starts_at)).getTime()) / 60_000));
      const ends = new Date(starts.getTime() + originalDuration * 60_000);
      const conflict = await db.prepare(`SELECT COUNT(*) AS total FROM calendar_bookings
        WHERE id <> ? AND event_type_id = ? AND tenant_id = ? AND status IN ('CONFIRMED','RESCHEDULED') AND starts_at < ? AND ends_at > ?`)
        .bind(id, booking.event_type_id, tenant.tenantId, ends.toISOString(), starts.toISOString()).first<{ total: number }>();
      if (Number(conflict?.total || 0) >= Number(booking.capacity || 1))
        return Response.json({ error: "That time is no longer available." }, { status: 409 });
      await db.prepare("UPDATE calendar_bookings SET starts_at = ?, ends_at = ?, status = 'RESCHEDULED', updated_at = ? WHERE id = ?")
        .bind(starts.toISOString(), ends.toISOString(), now, id).run();
    } else {
      const status = cleanText(body.status, 30).toUpperCase();
      const allowed = new Set(["CONFIRMED", "COMPLETED", "NO_SHOW"]);
      if (!allowed.has(status)) return Response.json({ error: "Choose a valid booking action." }, { status: 400 });
      await db.prepare("UPDATE calendar_bookings SET status = ?, notes = COALESCE(?, notes), assigned_to = COALESCE(?, assigned_to), updated_at = ? WHERE id = ?")
        .bind(status, cleanText(body.notes, 5000) || null, cleanText(body.assignedTo, 160) || null, now, id).run();
    }
    const recipient = cleanText(body.assignedTo,160) || String(booking.assigned_to || booking.created_by || tenant.email);
    await db.prepare(`INSERT INTO workspace_notifications (id,recipient,title,body,entity_type,entity_id,created_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), recipient, action === "RESCHEDULE" ? "Appointment rescheduled" : action === "CANCEL" ? "Appointment cancelled" : "Appointment updated", String(booking.customer_name || "Booking"), "BOOKING", id, now).run();
    const updated = await db.prepare("SELECT * FROM calendar_bookings WHERE id = ? AND tenant_id = ?").bind(id, tenant.tenantId).first<Record<string,unknown>>();
    if (updated) await syncGoogleBooking(tenant.email, { ...updated, event_name: booking.event_name || "Cyncro appointment" });
    // Automation webhooks — fire-and-forget
    {
      const webhookData = { bookingId: id, customerName: booking.customer_name, customerEmail: booking.customer_email, startsAt: updated?.starts_at, endsAt: updated?.ends_at, status: updated?.status };
      if (action === "CANCEL") void dispatchWebhookEvent("appointment.cancelled", webhookData);
      else if (action === "RESCHEDULE") void dispatchWebhookEvent("appointment.rescheduled", webhookData);
      else {
        const newStatus = String(updated?.status || "");
        if (newStatus === "COMPLETED") void dispatchWebhookEvent("appointment.completed", webhookData);
        else if (newStatus === "NO_SHOW") void dispatchWebhookEvent("appointment.no_show", webhookData);
        if (newStatus === "NO_SHOW" || newStatus === "COMPLETED") await emitAutomationEvent(tenant.tenantId, newStatus === "NO_SHOW" ? "BOOKING_NO_SHOW" : "BOOKING_COMPLETED", { contactId: String(booking.contact_id || ""), bookingId: id, customerName: String(booking.customer_name || ""), startsAt: String(booking.starts_at || ""), trigger: newStatus === "NO_SHOW" ? "BOOKING_NO_SHOW" : "BOOKING_COMPLETED" });
      }
    }
    // Audit log — fire-and-forget
    try {
      await db.prepare(`INSERT INTO calendar_audit_log (id, booking_id, entity_type, entity_id, action, actor, before_state, after_state, tenant_id, created_at)
        VALUES (?, ?, 'BOOKING', ?, ?, ?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), id, id, action, tenant.email,
        JSON.stringify({ status: booking.status, starts_at: booking.starts_at }),
        JSON.stringify({ status: updated?.status, starts_at: updated?.starts_at }),
        tenant.tenantId,
        new Date().toISOString()
      ).run();
    } catch { /* non-fatal */ }
    // Send transactional email
    try {
      const customerEmail = String(booking.customer_email || "");
      const customerName = String(booking.customer_name || "");
      const eventName = String(booking.event_name || "Appointment");
      const tz = String(booking.timezone || "UTC");
      const locationMode = String(booking.location_mode || "VIDEO");
      const videoPlatform = String(booking.video_platform || "") || null;
      const meetingAddress = String(booking.meeting_address || "") || null;
      if (customerEmail) {
        if (action === "CANCEL") {
          const { subject, html } = bookingCancellationEmail({ customerName, eventName, startsAt: String(booking.starts_at), timezone: tz });
          void sendEmail({ to: customerEmail, subject, html, tenantId: tenant.tenantId });
        } else if (action === "RESCHEDULE" && updated) {
          const { subject, html } = bookingRescheduleEmail({ customerName, eventName, newStartsAt: String(updated.starts_at), timezone: tz, locationMode, videoPlatform, meetingAddress });
          void sendEmail({ to: customerEmail, subject, html, tenantId: tenant.tenantId });
        }
      }
    } catch { /* non-fatal */ }
    return Response.json({ booking: updated });
  } catch (error) {
    console.error("calendar.bookings.update_failed", error);
    return Response.json({ error: "Unable to update booking." }, { status: 500 });
  }
}
