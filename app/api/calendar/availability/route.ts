import { cleanText, coreDb, ensureCoreSchema, hasModuleAccess } from "@/lib/core/db";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const url = new URL(request.url);
    const eventTypeId = cleanText(url.searchParams.get("eventTypeId"), 80);
    const from = new Date(url.searchParams.get("from") || "");
    const days = Math.min(Math.max(Number(url.searchParams.get("days") || 14), 1), 45);
    if (!eventTypeId || Number.isNaN(from.valueOf())) return Response.json({ error: "Event type and start date are required." }, { status: 400 });
    const db = coreDb();
    const eventType = await db.prepare("SELECT * FROM calendar_event_types WHERE id = ? AND active = 1").bind(eventTypeId).first<Record<string, unknown>>();
    if (!eventType) return Response.json({ error: "Event type not found." }, { status: 404 });
    const { results: rules } = await db.prepare("SELECT * FROM calendar_availability WHERE active = 1 AND (event_type_id = ? OR event_type_id IS NULL)").bind(eventTypeId).all<Record<string, unknown>>();
    const endRange = new Date(from.getTime() + days * 86_400_000);
    const { results: bookings } = await db.prepare(`SELECT starts_at, ends_at FROM calendar_bookings
      WHERE event_type_id = ? AND status IN ('CONFIRMED','RESCHEDULED') AND starts_at < ? AND ends_at > ?`)
      .bind(eventTypeId, endRange.toISOString(), from.toISOString()).all<{ starts_at: string; ends_at: string }>();
    const requestedDuration = Number(url.searchParams.get("durationMinutes") || eventType.duration_minutes);
    const allowedDurations = (() => { try { return JSON.parse(String(eventType.duration_options || "[]")) as number[]; } catch { return []; } })();
    const duration = allowedDurations.length && allowedDurations.includes(requestedDuration) ? requestedDuration : Number(eventType.duration_minutes);
    const capacity = Number(eventType.capacity || 1);
    const slots: { startsAt: string; endsAt: string; remaining: number }[] = [];
    for (let offset = 0; offset < days; offset++) {
      const day = new Date(from); day.setUTCDate(day.getUTCDate() + offset);
      for (const rule of rules.filter((item) => Number(item.weekday) === day.getUTCDay())) {
        const [startHour, startMinute] = String(rule.start_time).split(":").map(Number);
        const [endHour, endMinute] = String(rule.end_time).split(":").map(Number);
        const cursor = new Date(day); cursor.setUTCHours(startHour, startMinute, 0, 0);
        const dayEnd = new Date(day); dayEnd.setUTCHours(endHour, endMinute, 0, 0);
        while (cursor.getTime() + duration * 60_000 <= dayEnd.getTime()) {
          const slotEnd = new Date(cursor.getTime() + duration * 60_000);
          const used = bookings.filter((booking) => new Date(booking.starts_at) < slotEnd && new Date(booking.ends_at) > cursor).length;
          if (used < capacity && cursor > new Date()) slots.push({ startsAt: cursor.toISOString(), endsAt: slotEnd.toISOString(), remaining: capacity - used });
          cursor.setUTCMinutes(cursor.getUTCMinutes() + duration);
        }
      }
    }
    return Response.json({ slots, timezone: String(rules[0]?.timezone || "UTC") });
  } catch (error) {
    console.error("calendar.availability.failed", error);
    return Response.json({ error: "Unable to calculate availability." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const eventTypeId = cleanText(body.eventTypeId, 80) || null;
    const timezone = cleanText(body.timezone, 80);
    const rules = Array.isArray(body.rules) ? body.rules as Record<string, unknown>[] : [];
    if (!timezone || !rules.length) return Response.json({ error: "Timezone and weekly rules are required." }, { status: 400 });
    const db = coreDb();
    const statements = [db.prepare(eventTypeId ? "DELETE FROM calendar_availability WHERE event_type_id = ?" : "DELETE FROM calendar_availability WHERE event_type_id IS NULL").bind(...(eventTypeId ? [eventTypeId] : []))];
    for (const rule of rules) {
      const weekday = Number(rule.weekday); const start = cleanText(rule.startTime, 5); const end = cleanText(rule.endTime, 5);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start >= end)
        return Response.json({ error: "Each availability rule needs a valid weekday and time range." }, { status: 400 });
      statements.push(db.prepare(`INSERT INTO calendar_availability (id, event_type_id, weekday, start_time, end_time, timezone, active)
        VALUES (?, ?, ?, ?, ?, ?, 1)`).bind(crypto.randomUUID(), eventTypeId, weekday, start, end, timezone));
    }
    await db.batch(statements);
    return Response.json({ saved: rules.length });
  } catch (error) {
    console.error("calendar.availability.save_failed", error);
    return Response.json({ error: "Unable to save availability." }, { status: 500 });
  }
}
