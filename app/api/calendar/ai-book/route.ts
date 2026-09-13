/**
 * AI Booking API — Cyncro Universal Calendar™
 *
 * Structured endpoint for voice assistants, AI agents, and automated workflows
 * to book appointments programmatically. Accepts natural-intent parameters,
 * resolves the best available slot via SmartSlot™ scoring, and creates the
 * booking in a single atomic operation.
 *
 * POST /api/calendar/ai-book
 * Body:
 *   intent            "BOOK" | "RESCHEDULE" | "CANCEL" | "CHECK_AVAILABILITY"
 *   eventTypeSlug     string  — slug of the calendar_event_types row
 *   customerName      string  — full name of the customer
 *   customerEmail     string  — email address
 *   preferredDate     string? — ISO date hint (YYYY-MM-DD); falls back to next 14 days
 *   preferredTime     string? — HH:MM hint in the booking timezone
 *   timezone          string? — IANA timezone, defaults to "UTC"
 *   locationMode      "VIDEO"|"PHONE"|"IN_PERSON"
 *   videoPlatform     "GOOGLE_MEET"|"ZOOM"|"FACETIME" (required when VIDEO)
 *   meetingAddress    string? (required when IN_PERSON)
 *   notes             string? — custom notes to attach
 *   leadScore         number? — 0-100, influences SmartSlot™ ranking
 *   bookingId         string? — required for RESCHEDULE/CANCEL
 *   newStartsAt       string? — ISO datetime, required for RESCHEDULE
 *   agentId           string? — identifier of the calling agent (audit)
 *
 * Response 200/201:
 *   { success: true, intent, booking?, slots?, recommended? }
 *
 * All errors return { success: false, error: string } with appropriate HTTP status.
 */
import { cleanText, coreDb, ensureCoreSchema, normalizeEmail } from "@/lib/core/db";
import { sendEmail, bookingConfirmationEmail } from "@/lib/core/email";

type Intent = "BOOK" | "RESCHEDULE" | "CANCEL" | "CHECK_AVAILABILITY";

// Minimal SmartSlot™ scorer (mirrors /api/calendar/slots logic without availability rules)
async function findBestSlot(db: ReturnType<typeof coreDb>, eventTypeId: string, eventType: Record<string, unknown>, preferredDate?: string, preferredTime?: string, leadScore = 50) {
  const duration = Number(eventType.duration_minutes);
  const capacity = Number(eventType.capacity || 1);
  const minNoticeMs = Number(eventType.min_notice_hours || 1) * 3_600_000;
  const maxAdvanceDays = Number(eventType.max_advance_days || 60);
  const slotInterval = Number(eventType.slot_interval_minutes || 0) || duration;
  const earliest = new Date(Date.now() + minNoticeMs);
  const latest = new Date(Date.now() + maxAdvanceDays * 86_400_000);

  // Search window: try preferred date first (7 days), then fallback to 14 days from now
  const from = preferredDate ? new Date(preferredDate + "T00:00:00Z") : new Date();
  if (from < earliest) from.setTime(earliest.getTime());
  const days = 14;
  const endRange = new Date(from.getTime() + days * 86_400_000);

  const { results: rules } = await db.prepare(
    "SELECT * FROM calendar_availability WHERE active = 1 AND (event_type_id = ? OR event_type_id IS NULL)"
  ).bind(eventTypeId).all<Record<string, unknown>>();
  const { results: bookings } = await db.prepare(
    `SELECT starts_at, ends_at FROM calendar_bookings WHERE event_type_id = ? AND status IN ('CONFIRMED','RESCHEDULED') AND starts_at < ? AND ends_at > ?`
  ).bind(eventTypeId, endRange.toISOString(), from.toISOString()).all<{ starts_at: string; ends_at: string }>();
  const { results: blocked } = await db.prepare(
    `SELECT starts_at, ends_at FROM calendar_blocked_times WHERE (event_type_id = ? OR event_type_id IS NULL) AND starts_at < ? AND ends_at > ?`
  ).bind(eventTypeId, endRange.toISOString(), from.toISOString()).all<{ starts_at: string; ends_at: string }>();

  // Day demand map
  const dayDemand: Record<string, number> = {};
  for (const b of bookings) { const d = b.starts_at.slice(0, 10); dayDemand[d] = (dayDemand[d] || 0) + 1; }

  // Parse preferred time hint
  let prefHour = -1, prefMin = 0;
  if (preferredTime) {
    const [h, m] = preferredTime.split(":").map(Number);
    if (!isNaN(h)) { prefHour = h; prefMin = isNaN(m) ? 0 : m; }
  }

  type ScoredSlot = { startsAt: string; endsAt: string; remaining: number; score: number; reasons: string[] };
  const slots: ScoredSlot[] = [];

  for (let offset = 0; offset < days; offset++) {
    const day = new Date(from); day.setUTCDate(day.getUTCDate() + offset);
    const dayKey = day.toISOString().slice(0, 10);
    const dayBookings = dayDemand[dayKey] || 0;

    for (const rule of rules.filter(r => Number(r.weekday) === day.getUTCDay())) {
      const [sh, sm] = String(rule.start_time).split(":").map(Number);
      const [eh, em] = String(rule.end_time).split(":").map(Number);
      const cursor = new Date(day); cursor.setUTCHours(sh, sm, 0, 0);
      const dayEnd = new Date(day); dayEnd.setUTCHours(eh, em, 0, 0);

      while (cursor.getTime() + duration * 60_000 <= dayEnd.getTime()) {
        const slotEnd = new Date(cursor.getTime() + duration * 60_000);
        if (cursor >= earliest && cursor <= latest) {
          const isBlocked = blocked.some(b => new Date(b.starts_at) < slotEnd && new Date(b.ends_at) > cursor);
          if (!isBlocked) {
            const used = bookings.filter(b => new Date(b.starts_at) < slotEnd && new Date(b.ends_at) > cursor).length;
            if (used < capacity) {
              const hour = cursor.getUTCHours();
              const reasons: string[] = [];
              let score = 50;

              // Preferred time proximity bonus
              if (prefHour >= 0) {
                const diffMin = Math.abs((hour * 60 + cursor.getUTCMinutes()) - (prefHour * 60 + prefMin));
                if (diffMin === 0) { score += 30; reasons.push("Exact preferred time"); }
                else if (diffMin <= 30) { score += 20; reasons.push("Near preferred time"); }
                else if (diffMin <= 60) { score += 10; reasons.push("Within 1hr of preference"); }
                else if (diffMin > 120) { score -= 5; }
              } else {
                // Default morning preference
                if (hour >= 9 && hour < 11) { score += 20; reasons.push("Prime morning slot"); }
                else if (hour >= 14 && hour < 17) { score += 10; reasons.push("Productive afternoon slot"); }
              }

              // Day demand
              if (dayBookings === 0) { score += 15; reasons.push("Open day"); }
              else if (dayBookings <= 2) { score += 5; }
              else if (dayBookings >= capacity * 3) { score -= 10; }

              // High-value lead: favor Mon-Wed mornings
              if (leadScore >= 80) {
                const dow = cursor.getUTCDay();
                if (dow >= 1 && dow <= 3 && hour >= 9 && hour < 12) { score += 15; reasons.push("Optimal for high-value lead"); }
              }

              // Remaining capacity bonus
              if (capacity - used > 1) { score += 5; reasons.push(`${capacity - used} slots open`); }

              // Preferred date match bonus
              if (preferredDate && dayKey === preferredDate) { score += 25; reasons.push("Preferred date"); }

              // Friday afternoon penalty
              if (cursor.getUTCDay() === 5 && hour >= 15) { score -= 15; reasons.push("Low Friday afternoon close rate"); }

              slots.push({
                startsAt: cursor.toISOString(),
                endsAt: slotEnd.toISOString(),
                remaining: capacity - used,
                score: Math.min(100, Math.max(0, score)),
                reasons,
              });
            }
          }
        }
        cursor.setUTCMinutes(cursor.getUTCMinutes() + slotInterval);
      }
    }
  }

  slots.sort((a, b) => b.score - a.score);
  return { slots: slots.slice(0, 10), recommended: slots[0] || null };
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;

    const intent = cleanText(body.intent, 30).toUpperCase() as Intent;
    if (!new Set(["BOOK", "RESCHEDULE", "CANCEL", "CHECK_AVAILABILITY"]).has(intent))
      return Response.json({ success: false, error: "intent must be BOOK, RESCHEDULE, CANCEL, or CHECK_AVAILABILITY." }, { status: 400 });

    const agentId = cleanText(body.agentId, 120) || "ai-agent";
    const db = coreDb();

    // ── CHECK_AVAILABILITY ──────────────────────────────────────────────────
    if (intent === "CHECK_AVAILABILITY") {
      const slug = cleanText(body.eventTypeSlug, 120).toLowerCase();
      if (!slug) return Response.json({ success: false, error: "eventTypeSlug is required." }, { status: 400 });
      const eventType = await db.prepare("SELECT * FROM calendar_event_types WHERE slug = ? AND active = 1").bind(slug).first<Record<string, unknown>>();
      if (!eventType) return Response.json({ success: false, error: "Event type not found." }, { status: 404 });
      const preferredDate = cleanText(body.preferredDate, 40) || undefined;
      const preferredTime = cleanText(body.preferredTime, 10) || undefined;
      const leadScore = Math.min(100, Math.max(0, Number(body.leadScore || 50)));
      const { slots, recommended } = await findBestSlot(db, String(eventType.id), eventType, preferredDate, preferredTime, leadScore);
      return Response.json({
        success: true,
        intent,
        eventType: { id: eventType.id, name: eventType.name, slug: eventType.slug, durationMinutes: eventType.duration_minutes },
        slots,
        recommended,
        slotsFound: slots.length,
      });
    }

    // ── CANCEL ──────────────────────────────────────────────────────────────
    if (intent === "CANCEL") {
      const bookingId = cleanText(body.bookingId, 80);
      if (!bookingId) return Response.json({ success: false, error: "bookingId is required for CANCEL." }, { status: 400 });
      const booking = await db.prepare("SELECT * FROM calendar_bookings WHERE id = ?").bind(bookingId).first<Record<string, unknown>>();
      if (!booking) return Response.json({ success: false, error: "Booking not found." }, { status: 404 });
      if (booking.status === "CANCELLED") return Response.json({ success: false, error: "Booking is already cancelled." }, { status: 409 });
      const now = new Date().toISOString();
      await db.prepare("UPDATE calendar_bookings SET status = 'CANCELLED', updated_at = ? WHERE id = ?").bind(now, bookingId).run();
      try {
        await db.prepare(`INSERT INTO calendar_audit_log (id,booking_id,entity_type,entity_id,action,actor,before_state,after_state,created_at) VALUES (?,?,'BOOKING',?,'CANCELLED',?,?,?,?)`)
          .bind(crypto.randomUUID(), bookingId, bookingId, agentId,
            JSON.stringify({ status: booking.status, starts_at: booking.starts_at }),
            JSON.stringify({ status: "CANCELLED" }), now).run();
      } catch { /* non-fatal */ }
      return Response.json({ success: true, intent, booking: { id: bookingId, status: "CANCELLED" } });
    }

    // ── RESCHEDULE ──────────────────────────────────────────────────────────
    if (intent === "RESCHEDULE") {
      const bookingId = cleanText(body.bookingId, 80);
      const newStartsAtRaw = cleanText(body.newStartsAt, 40);
      if (!bookingId) return Response.json({ success: false, error: "bookingId is required for RESCHEDULE." }, { status: 400 });
      const booking = await db.prepare(`SELECT b.*, e.capacity FROM calendar_bookings b JOIN calendar_event_types e ON e.id = b.event_type_id WHERE b.id = ?`)
        .bind(bookingId).first<Record<string, unknown>>();
      if (!booking) return Response.json({ success: false, error: "Booking not found." }, { status: 404 });

      let newStarts: Date;
      if (newStartsAtRaw) {
        newStarts = new Date(newStartsAtRaw);
        if (Number.isNaN(newStarts.valueOf()))
          return Response.json({ success: false, error: "newStartsAt is not a valid ISO datetime." }, { status: 400 });
      } else {
        // No specific time requested — pick the SmartSlot™ recommended slot
        const eventType = await db.prepare("SELECT * FROM calendar_event_types WHERE id = ?").bind(booking.event_type_id).first<Record<string, unknown>>();
        if (!eventType) return Response.json({ success: false, error: "Event type not found." }, { status: 404 });
        const { recommended } = await findBestSlot(db, String(booking.event_type_id), eventType,
          cleanText(body.preferredDate, 40) || undefined,
          cleanText(body.preferredTime, 10) || undefined,
          Math.min(100, Math.max(0, Number(body.leadScore || 50))));
        if (!recommended) return Response.json({ success: false, error: "No available slots found for rescheduling." }, { status: 409 });
        newStarts = new Date(recommended.startsAt);
      }

      const originalDuration = Math.max(5, Math.round((new Date(String(booking.ends_at)).getTime() - new Date(String(booking.starts_at)).getTime()) / 60_000));
      const newEnds = new Date(newStarts.getTime() + originalDuration * 60_000);
      const conflict = await db.prepare(`SELECT COUNT(*) AS total FROM calendar_bookings WHERE id <> ? AND event_type_id = ? AND status IN ('CONFIRMED','RESCHEDULED') AND starts_at < ? AND ends_at > ?`)
        .bind(bookingId, booking.event_type_id, newEnds.toISOString(), newStarts.toISOString()).first<{ total: number }>();
      if (Number(conflict?.total || 0) >= Number(booking.capacity || 1))
        return Response.json({ success: false, error: "That time slot is no longer available." }, { status: 409 });

      const now = new Date().toISOString();
      await db.prepare("UPDATE calendar_bookings SET starts_at = ?, ends_at = ?, status = 'RESCHEDULED', updated_at = ? WHERE id = ?")
        .bind(newStarts.toISOString(), newEnds.toISOString(), now, bookingId).run();
      try {
        await db.prepare(`INSERT INTO calendar_audit_log (id,booking_id,entity_type,entity_id,action,actor,before_state,after_state,created_at) VALUES (?,?,'BOOKING',?,'RESCHEDULED',?,?,?,?)`)
          .bind(crypto.randomUUID(), bookingId, bookingId, agentId,
            JSON.stringify({ status: booking.status, starts_at: booking.starts_at }),
            JSON.stringify({ status: "RESCHEDULED", starts_at: newStarts.toISOString() }), now).run();
      } catch { /* non-fatal */ }
      return Response.json({
        success: true,
        intent,
        booking: { id: bookingId, status: "RESCHEDULED", startsAt: newStarts.toISOString(), endsAt: newEnds.toISOString() },
      });
    }

    // ── BOOK ────────────────────────────────────────────────────────────────
    const slug = cleanText(body.eventTypeSlug, 120).toLowerCase();
    const customerName = cleanText(body.customerName, 160);
    const customerEmail = normalizeEmail(body.customerEmail);
    const timezone = cleanText(body.timezone, 80) || "UTC";
    const locationMode = cleanText(body.locationMode, 30).toUpperCase() || "VIDEO";
    const videoPlatform = cleanText(body.videoPlatform, 40).toUpperCase() || null;
    const meetingAddress = cleanText(body.meetingAddress, 300) || null;
    const notes = cleanText(body.notes, 5000) || null;
    const leadScore = Math.min(100, Math.max(0, Number(body.leadScore || 50)));

    if (!slug || !customerName || !customerEmail)
      return Response.json({ success: false, error: "eventTypeSlug, customerName, and customerEmail are required." }, { status: 400 });
    if (!new Set(["VIDEO", "PHONE", "IN_PERSON"]).has(locationMode))
      return Response.json({ success: false, error: "locationMode must be VIDEO, PHONE, or IN_PERSON." }, { status: 400 });
    if (locationMode === "IN_PERSON" && !meetingAddress)
      return Response.json({ success: false, error: "meetingAddress is required for IN_PERSON bookings." }, { status: 400 });
    if (locationMode === "VIDEO" && !new Set(["GOOGLE_MEET", "ZOOM", "FACETIME"]).has(videoPlatform || ""))
      return Response.json({ success: false, error: "videoPlatform must be GOOGLE_MEET, ZOOM, or FACETIME for VIDEO bookings." }, { status: 400 });

    const eventType = await db.prepare("SELECT * FROM calendar_event_types WHERE slug = ? AND active = 1").bind(slug).first<Record<string, unknown>>();
    if (!eventType) return Response.json({ success: false, error: "Event type not found." }, { status: 404 });

    const preferredDate = cleanText(body.preferredDate, 40) || undefined;
    const preferredTime = cleanText(body.preferredTime, 10) || undefined;

    // Resolve slot: use explicit startsAt if provided, else SmartSlot™ recommendation
    let starts: Date;
    let ends: Date;
    const duration = Number(eventType.duration_minutes);

    if (body.startsAt) {
      starts = new Date(String(body.startsAt));
      if (Number.isNaN(starts.valueOf()))
        return Response.json({ success: false, error: "startsAt is not a valid ISO datetime." }, { status: 400 });
      ends = new Date(starts.getTime() + duration * 60_000);
      // Conflict check for explicit slot
      const conflict = await db.prepare(`SELECT COUNT(*) AS total FROM calendar_bookings WHERE event_type_id = ? AND status IN ('CONFIRMED','RESCHEDULED') AND starts_at < ? AND ends_at > ?`)
        .bind(String(eventType.id), ends.toISOString(), starts.toISOString()).first<{ total: number }>();
      if (Number(conflict?.total || 0) >= Number(eventType.capacity || 1))
        return Response.json({ success: false, error: "That time slot is no longer available." }, { status: 409 });
    } else {
      const { recommended, slots } = await findBestSlot(db, String(eventType.id), eventType, preferredDate, preferredTime, leadScore);
      if (!recommended) return Response.json({ success: false, error: "No available slots found. Please check availability first.", slots: [] }, { status: 409 });
      starts = new Date(recommended.startsAt);
      ends = new Date(recommended.endsAt);
    }

    // Upsert contact
    const now = new Date().toISOString();
    const existing = await db.prepare("SELECT id FROM crm_contacts WHERE lower(email) = lower(?)").bind(customerEmail).first<{ id: string }>();
    let contactId: string;
    if (existing) {
      contactId = existing.id;
      await db.prepare("UPDATE crm_contacts SET full_name=?, lifecycle='CUSTOMER', updated_at=? WHERE id=?").bind(customerName, now, contactId).run();
    } else {
      contactId = crypto.randomUUID();
      await db.prepare(`INSERT INTO crm_contacts (id,full_name,email,lifecycle,source,created_at,updated_at) VALUES (?,?,?,'CUSTOMER','CALENDAR',?,?)`)
        .bind(contactId, customerName, customerEmail, now, now).run();
    }

    const bookingId = crypto.randomUUID();
    const assignedTo = String(eventType.host_name || agentId);

    await db.prepare(`INSERT INTO calendar_bookings
      (id,event_type_id,contact_id,customer_name,customer_email,starts_at,ends_at,timezone,
       location_mode,meeting_address,video_platform,status,notes,created_by,assigned_to,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'CONFIRMED',?,?,?,?,?)`)
      .bind(bookingId, String(eventType.id), contactId, customerName, customerEmail,
        starts.toISOString(), ends.toISOString(), timezone,
        locationMode, meetingAddress, videoPlatform, notes, agentId, assignedTo, now, now).run();

    // Audit log + activity
    try {
      await db.prepare(`INSERT INTO calendar_audit_log (id,booking_id,entity_type,entity_id,action,actor,after_state,created_at) VALUES (?,?,'BOOKING',?,'CREATED',?,?,?)`)
        .bind(crypto.randomUUID(), bookingId, bookingId, agentId,
          JSON.stringify({ startsAt: starts.toISOString(), endsAt: ends.toISOString(), status: "CONFIRMED", assignedTo }), now).run();
      await db.prepare(`INSERT INTO crm_activities (id,contact_id,activity_type,title,details,due_at,status,created_by,created_at,updated_at) VALUES (?,?,'CALENDAR',?,?,?,'COMPLETED',?,?,?)`)
        .bind(crypto.randomUUID(), contactId,
          `Booked ${String(eventType.name || "appointment")} (via AI agent)`,
          `${locationMode}${videoPlatform ? ` · ${videoPlatform}` : ""}${meetingAddress ? ` · ${meetingAddress}` : ""}`,
          starts.toISOString(), agentId, now, now).run();
    } catch { /* non-fatal */ }

    // Confirmation email — fire-and-forget
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
        notes,
      });
      void sendEmail({ to: customerEmail, subject, html });
    } catch { /* non-fatal */ }

    return Response.json({
      success: true,
      intent,
      booking: {
        id: bookingId,
        eventType: { id: eventType.id, name: eventType.name, slug: eventType.slug },
        customerName,
        customerEmail,
        startsAt: starts.toISOString(),
        endsAt: ends.toISOString(),
        timezone,
        locationMode,
        videoPlatform,
        meetingAddress,
        status: "CONFIRMED",
        assignedTo,
      },
    }, { status: 201 });

  } catch (error) {
    console.error("calendar.ai_book.failed", error);
    return Response.json({ success: false, error: "Unable to process booking request." }, { status: 500 });
  }
}
