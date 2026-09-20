import { cleanText, coreDb, ensureCoreSchema, normalizeEmail } from "@/lib/core/db";
import { requireTenant, requireTenantAction } from "@/lib/core/tenantAuth";

// Advance a date by one recurrence interval
function advanceDate(d: Date, frequency: string, interval: number): Date {
  const next = new Date(d);
  if (frequency === "DAILY") next.setUTCDate(next.getUTCDate() + interval);
  else if (frequency === "WEEKLY") next.setUTCDate(next.getUTCDate() + 7 * interval);
  else if (frequency === "MONTHLY") next.setUTCMonth(next.getUTCMonth() + interval);
  else if (frequency === "YEARLY") next.setUTCFullYear(next.getUTCFullYear() + interval);
  return next;
}

// Generate occurrence dates for a recurrence rule (up to maxCount, ending before endsOn)
function generateOccurrences(rule: {
  starts_on: string; ends_on?: string | null; frequency: string;
  interval_count: number; max_occurrences: number; weekdays?: string | null;
}, maxCount = 50): Date[] {
  const occurrences: Date[] = [];
  const weekdays: number[] = rule.weekdays ? (JSON.parse(rule.weekdays) as number[]) : [];
  let cursor = new Date(rule.starts_on);
  const limit = Math.min(rule.max_occurrences || maxCount, maxCount);
  const endDate = rule.ends_on ? new Date(rule.ends_on) : null;

  while (occurrences.length < limit) {
    if (endDate && cursor > endDate) break;
    // For WEEKLY with weekday filter: emit only matching days within each week
    if (rule.frequency === "WEEKLY" && weekdays.length > 0) {
      for (let wd = 0; wd < 7 && occurrences.length < limit; wd++) {
        const candidate = new Date(cursor);
        candidate.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay() + wd);
        if (weekdays.includes(wd) && candidate >= new Date(rule.starts_on)) {
          if (!endDate || candidate <= endDate) occurrences.push(new Date(candidate));
        }
      }
      cursor = advanceDate(cursor, "WEEKLY", rule.interval_count);
    } else {
      occurrences.push(new Date(cursor));
      cursor = advanceDate(cursor, rule.frequency, rule.interval_count);
    }
  }
  return occurrences;
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const url = new URL(request.url);
    const contactId = cleanText(url.searchParams.get("contactId"), 80);
    const eventTypeId = cleanText(url.searchParams.get("eventTypeId"), 80);
    let query = `SELECT r.*, e.name AS event_name, e.color AS event_color
      FROM calendar_recurrence_rules r
      LEFT JOIN calendar_event_types e ON e.id = r.event_type_id WHERE r.tenant_id = ?`;
    const params: unknown[] = [tenant.tenantId];
    if (contactId) { query += " AND r.contact_id = ?"; params.push(contactId); }
    if (eventTypeId) { query += " AND r.event_type_id = ?"; params.push(eventTypeId); }
    query += " ORDER BY r.created_at DESC LIMIT 100";
    const { results } = await coreDb().prepare(query).bind(...params).all();
    return Response.json({ recurrences: results });
  } catch (error) {
    console.error("calendar.recurrences.list_failed", error);
    return Response.json({ error: "Unable to load recurrences." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "create");
    if (tenant instanceof Response) return tenant;
    const body = (await request.json()) as Record<string, unknown>;
    const eventTypeId = cleanText(body.eventTypeId, 80);
    const customerName = cleanText(body.customerName, 160);
    const customerEmail = normalizeEmail(body.customerEmail);
    const frequency = cleanText(body.frequency, 20).toUpperCase() || "WEEKLY";
    const startsOn = cleanText(body.startsOn, 40);
    if (!eventTypeId || !customerName || !customerEmail || !startsOn)
      return Response.json({ error: "Event type, customer, and start date are required." }, { status: 400 });
    if (!new Set(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).has(frequency))
      return Response.json({ error: "Frequency must be DAILY, WEEKLY, MONTHLY, or YEARLY." }, { status: 400 });
    const db = coreDb();
    const eventType = await db.prepare("SELECT * FROM calendar_event_types WHERE id = ? AND active = 1 AND tenant_id = ?").bind(eventTypeId, tenant.tenantId).first<Record<string,unknown>>();
    if (!eventType) return Response.json({ error: "Event type not found." }, { status: 404 });
    const intervalCount = Math.max(1, Math.min(52, Number(body.intervalCount || 1)));
    const maxOccurrences = Math.max(1, Math.min(200, Number(body.maxOccurrences || 10)));
    const weekdays = Array.isArray(body.weekdays) ? JSON.stringify(body.weekdays) : null;
    const dayOfMonth = body.dayOfMonth != null ? Math.max(1, Math.min(31, Number(body.dayOfMonth))) : null;
    const endsOn = cleanText(body.endsOn, 40) || null;
    const contactId = cleanText(body.contactId, 80) || null;
    const locationMode = cleanText(body.locationMode, 30).toUpperCase() || "VIDEO";
    const timezone = cleanText(body.timezone, 80) || "UTC";
    const notes = cleanText(body.notes, 2000) || null;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO calendar_recurrence_rules
      (id, event_type_id, contact_id, customer_name, customer_email, frequency, interval_count, weekdays,
       day_of_month, starts_on, ends_on, max_occurrences, occurrence_count, timezone, location_mode, notes, status, created_by, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`)
      .bind(id, eventTypeId, contactId, customerName, customerEmail, frequency, intervalCount, weekdays,
        dayOfMonth, startsOn, endsOn, maxOccurrences, timezone, locationMode, notes, tenant.email, tenant.tenantId, now, now).run();
    // Generate and create the first N bookings
    const duration = Number(eventType.duration_minutes || 30);
    const ruleForGen = { starts_on: startsOn, ends_on: endsOn, frequency, interval_count: intervalCount, max_occurrences: maxOccurrences, weekdays };
    const occurrences = generateOccurrences(ruleForGen, Math.min(maxOccurrences, 12));
    const created: string[] = [];
    for (const occ of occurrences) {
      // Parse time from startsOn if it includes a time component, else use 09:00
      const [datePart, timePart] = startsOn.split("T");
      const [hour, min] = (timePart || "09:00").replace("Z","").split(":").map(Number);
      const slotStart = new Date(occ);
      slotStart.setUTCHours(isNaN(hour)?9:hour, isNaN(min)?0:min, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + duration * 60_000);
      const bid = crypto.randomUUID();
      try {
        await db.prepare(`INSERT INTO calendar_bookings
          (id, event_type_id, contact_id, customer_name, customer_email, starts_at, ends_at, timezone,
           location_mode, status, recurrence_rule_id, created_by, assigned_to, tenant_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?)`)
          .bind(bid, eventTypeId, contactId, customerName, customerEmail,
            slotStart.toISOString(), slotEnd.toISOString(), timezone, locationMode,
            id, tenant.email, tenant.email, tenant.tenantId, now, now).run();
        created.push(bid);
      } catch { /* skip conflicts */ }
    }
    await db.prepare("UPDATE calendar_recurrence_rules SET occurrence_count = ? WHERE id = ?").bind(created.length, id).run();
    return Response.json({ id, bookingsCreated: created.length, occurrences: occurrences.map(d=>d.toISOString()) }, { status: 201 });
  } catch (error) {
    console.error("calendar.recurrences.create_failed", error);
    return Response.json({ error: "Unable to create recurring series." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "edit");
    if (tenant instanceof Response) return tenant;
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Recurrence id is required." }, { status: 400 });
    const status = cleanText(body.status, 20).toUpperCase();
    const allowed = new Set(["ACTIVE", "PAUSED", "CANCELLED"]);
    if (!allowed.has(status)) return Response.json({ error: "Status must be ACTIVE, PAUSED, or CANCELLED." }, { status: 400 });
    const owned = await coreDb().prepare("SELECT id FROM calendar_recurrence_rules WHERE id=? AND tenant_id=?").bind(id, tenant.tenantId).first();
    if (!owned) return Response.json({ error: "Recurrence not found." }, { status: 404 });
    const now = new Date().toISOString();
    await coreDb().prepare("UPDATE calendar_recurrence_rules SET status = ?, updated_at = ? WHERE id = ?").bind(status, now, id).run();
    if (status === "CANCELLED") {
      // Cancel all future bookings in this series
      await coreDb().prepare(`UPDATE calendar_bookings SET status = 'CANCELLED', updated_at = ? WHERE recurrence_rule_id = ? AND starts_at > ? AND status IN ('CONFIRMED','RESCHEDULED')`)
        .bind(now, id, now).run();
    }
    const updated = await coreDb().prepare("SELECT * FROM calendar_recurrence_rules WHERE id = ?").bind(id).first();
    return updated ? Response.json({ recurrence: updated }) : Response.json({ error: "Not found." }, { status: 404 });
  } catch (error) {
    console.error("calendar.recurrences.update_failed", error);
    return Response.json({ error: "Unable to update recurrence." }, { status: 500 });
  }
}
