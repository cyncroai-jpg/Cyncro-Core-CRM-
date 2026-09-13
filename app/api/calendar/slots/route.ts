import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";

/**
 * SmartSlot™ Engine — ranked slot recommendations with explainable scoring.
 * Returns available slots ordered by a composite score considering:
 *  - Time-of-day preference (morning premium)
 *  - Day-of-week demand balance
 *  - Rep availability distribution
 *  - Booking velocity (avoid overcrowded days)
 *  - Lead score context (when provided)
 */
export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const url = new URL(request.url);
    const eventTypeId = cleanText(url.searchParams.get("eventTypeId"), 80);
    const from = new Date(url.searchParams.get("from") || "");
    const days = Math.min(Math.max(Number(url.searchParams.get("days") || 14), 1), 30);
    const leadScore = Math.min(100, Math.max(0, Number(url.searchParams.get("leadScore") || 50)));
    const preferMorning = url.searchParams.get("preferMorning") !== "false";
    if (!eventTypeId || Number.isNaN(from.valueOf()))
      return Response.json({ error: "Event type and start date are required." }, { status: 400 });
    const db = coreDb();
    const eventType = await db.prepare("SELECT * FROM calendar_event_types WHERE id = ? AND active = 1").bind(eventTypeId).first<Record<string, unknown>>();
    if (!eventType) return Response.json({ error: "Event type not found." }, { status: 404 });
    // Get raw availability slots from the existing availability engine
    const endRange = new Date(from.getTime() + days * 86_400_000);
    const { results: rules } = await db.prepare(
      "SELECT * FROM calendar_availability WHERE active = 1 AND (event_type_id = ? OR event_type_id IS NULL)"
    ).bind(eventTypeId).all<Record<string, unknown>>();
    const { results: bookings } = await db.prepare(
      `SELECT starts_at, ends_at, assigned_to FROM calendar_bookings WHERE event_type_id = ? AND status IN ('CONFIRMED','RESCHEDULED') AND starts_at < ? AND ends_at > ?`
    ).bind(eventTypeId, endRange.toISOString(), from.toISOString()).all<{ starts_at: string; ends_at: string; assigned_to: string }>();
    const { results: blocked } = await db.prepare(
      `SELECT starts_at, ends_at FROM calendar_blocked_times WHERE (event_type_id = ? OR event_type_id IS NULL) AND starts_at < ? AND ends_at > ?`
    ).bind(eventTypeId, endRange.toISOString(), from.toISOString()).all<{ starts_at: string; ends_at: string }>();
    const duration = Number(eventType.duration_minutes);
    const capacity = Number(eventType.capacity || 1);
    const minNoticeMs = Number(eventType.min_notice_hours || 1) * 3_600_000;
    const maxAdvanceDays = Number(eventType.max_advance_days || 60);
    const slotInterval = Number(eventType.slot_interval_minutes || 0) || duration;
    const earliest = new Date(Date.now() + minNoticeMs);
    const latest = new Date(Date.now() + maxAdvanceDays * 86_400_000);
    type ScoredSlot = { startsAt: string; endsAt: string; remaining: number; score: number; reasons: string[] };
    const slots: ScoredSlot[] = [];
    // Day demand: count bookings per day
    const dayDemand: Record<string, number> = {};
    for (const b of bookings) {
      const day = b.starts_at.slice(0, 10);
      dayDemand[day] = (dayDemand[day] || 0) + 1;
    }
    for (let offset = 0; offset < days; offset++) {
      const day = new Date(from); day.setUTCDate(day.getUTCDate() + offset);
      const dayKey = day.toISOString().slice(0, 10);
      const dayBookings = dayDemand[dayKey] || 0;
      for (const rule of rules.filter((r) => Number(r.weekday) === day.getUTCDay())) {
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
                // SmartSlot™ scoring
                const hour = cursor.getUTCHours();
                const reasons: string[] = [];
                let score = 50;
                // Morning preference (9-11am best for high-value leads)
                if (preferMorning && hour >= 9 && hour < 11) { score += 20; reasons.push("Prime morning slot"); }
                else if (hour >= 14 && hour < 17) { score += 10; reasons.push("Productive afternoon slot"); }
                // Low demand day = better for capacity
                if (dayBookings === 0) { score += 15; reasons.push("Open day — fast confirmation"); }
                else if (dayBookings <= 2) { score += 5; reasons.push("Lightly scheduled day"); }
                else if (dayBookings >= capacity * 3) { score -= 10; reasons.push("High-demand day"); }
                // Lead score weight: high-value leads get best slots (mornings on Mon/Tue/Wed)
                if (leadScore >= 80) {
                  const dow = cursor.getUTCDay();
                  if (dow >= 1 && dow <= 3 && hour >= 9 && hour < 12) { score += 15; reasons.push("Optimal for high-value lead"); }
                }
                // Availability remaining
                if (capacity - used > 1) { score += 5; reasons.push(`${capacity - used} slots open`); }
                // Friday afternoon penalty
                if (cursor.getUTCDay() === 5 && hour >= 15) { score -= 15; reasons.push("Low Friday afternoon close rate"); }
                slots.push({ startsAt: cursor.toISOString(), endsAt: slotEnd.toISOString(), remaining: capacity - used, score: Math.min(100, Math.max(0, score)), reasons });
              }
            }
          }
          cursor.setUTCMinutes(cursor.getUTCMinutes() + slotInterval);
        }
      }
    }
    slots.sort((a, b) => b.score - a.score);
    return Response.json({
      slots: slots.slice(0, 50),
      recommended: slots[0] || null,
      timezone: String(rules[0]?.timezone || "UTC"),
      leadScore,
    });
  } catch (error) {
    console.error("calendar.smartslots.failed", error);
    return Response.json({ error: "Unable to compute smart slots." }, { status: 500 });
  }
}
