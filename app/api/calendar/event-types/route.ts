import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant, requireTenantAction, tenantForBooking } from "@/lib/core/tenantAuth";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const slug = cleanText(new URL(request.url).searchParams.get("slug"), 120);
    const tenant = slug ? await tenantForBooking(request, { slug }) : await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    if (slug && tenant.role === "VIEWER" && !tenant.userId) {
      // Anonymous visitor on a shared booking link: expose only that event type, with the booking-page fields.
      const one = await coreDb().prepare("SELECT id,name,slug,description,duration_minutes,duration_options,capacity,location_modes,video_platforms,host_name,custom_questions,smartslot_enabled FROM calendar_event_types WHERE slug = ? AND active = 1 AND tenant_id = ?").bind(slug, tenant.tenantId).first();
      return Response.json({ eventTypes: one ? [one] : [], public: true });
    }
    const { results } = await coreDb().prepare("SELECT * FROM calendar_event_types WHERE active = 1 AND tenant_id = ? ORDER BY name").bind(tenant.tenantId).all();
    return Response.json({ eventTypes: results });
  } catch (error) {
    console.error("calendar.event_types.list_failed", error);
    return Response.json({ error: "Unable to load event types." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "create");
    if (tenant instanceof Response) return tenant;
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    const slug = cleanText(body.slug, 120).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const duration = Number(body.durationMinutes);
    const capacity = Number(body.capacity || 1);
    if (!name || !slug || !Number.isInteger(duration) || duration < 5 || duration > 1440)
      return Response.json({ error: "Name, slug, and a valid duration are required." }, { status: 400 });
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500)
      return Response.json({ error: "Capacity must be between 1 and 500." }, { status: 400 });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    // Booking links are public URLs, so slugs are unique across every company.
    // If another company already uses this one, pick the next free variant
    // (team-consult, team-consult-2, …) instead of failing.
    let finalSlug = slug;
    for (let n = 2; n < 50; n++) {
      const taken = await coreDb().prepare("SELECT id, tenant_id FROM calendar_event_types WHERE slug=?").bind(finalSlug).first<{ id: string; tenant_id: string }>();
      if (!taken) break;
      if (taken.tenant_id === tenant.tenantId) return Response.json({ error: `You already have a booking link called "${finalSlug}". Choose a different slug.` }, { status: 409 });
      finalSlug = `${slug}-${n}`;
    }
    await coreDb().prepare(`INSERT INTO calendar_event_types
      (id, name, slug, description, duration_minutes, duration_options, buffer_before_minutes, buffer_after_minutes, capacity, location_modes, video_platforms, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, name, finalSlug, cleanText(body.description, 1000) || null, duration, JSON.stringify([duration]),
        Math.max(0, Number(body.bufferBeforeMinutes || 0)), Math.max(0, Number(body.bufferAfterMinutes || 0)), capacity,
        JSON.stringify(Array.isArray(body.locationModes) ? body.locationModes : ["VIDEO"]),
        JSON.stringify(Array.isArray(body.videoPlatforms) ? body.videoPlatforms : ["GOOGLE_MEET", "ZOOM", "FACETIME"]), tenant.tenantId, now, now).run();
    if (cleanText(body.hostName, 160)) await coreDb().prepare("UPDATE calendar_event_types SET host_name=? WHERE id=? AND tenant_id=?").bind(cleanText(body.hostName,160),id,tenant.tenantId).run();
    return Response.json({ id, slug: finalSlug, slugAdjusted: finalSlug !== slug }, { status: 201 });
  } catch (error) {
    console.error("calendar.event_types.create_failed", error);
    return Response.json({ error: "Unable to create event type. The booking-link slug may already exist." }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "edit");
    if (tenant instanceof Response) return tenant;
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Event type id is required." }, { status: 400 });
    const owned = await coreDb().prepare("SELECT id FROM calendar_event_types WHERE id=? AND tenant_id=?").bind(id, tenant.tenantId).first();
    if (!owned) return Response.json({ error: "Event type not found." }, { status: 404 });
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => { fields.push(`${column} = ?`); values.push(value); };
    if (body.name !== undefined) add("name", cleanText(body.name, 160));
    if (body.description !== undefined) add("description", cleanText(body.description, 1000) || null);
    for (const [key, column, min, max] of [
      ["durationMinutes", "duration_minutes", 5, 1440], ["bufferBeforeMinutes", "buffer_before_minutes", 0, 1440],
      ["bufferAfterMinutes", "buffer_after_minutes", 0, 1440], ["capacity", "capacity", 1, 500],
    ] as const) if (body[key] !== undefined) {
      const value = Number(body[key]);
      if (!Number.isInteger(value) || value < min || value > max)
        return Response.json({ error: `${key} is outside the allowed range.` }, { status: 400 });
      add(column, value);
      if (key === "durationMinutes") add("duration_options", JSON.stringify([value]));
    }
    if (Array.isArray(body.locationModes)) add("location_modes", JSON.stringify(body.locationModes));
    if (Array.isArray(body.videoPlatforms)) add("video_platforms", JSON.stringify(body.videoPlatforms));
    if (body.hostName !== undefined) add("host_name", cleanText(body.hostName, 160) || null);
    if (body.active !== undefined) add("active", body.active ? 1 : 0);
    if (body.color !== undefined) add("color", cleanText(body.color, 20) || "#C1283E");
    if (body.priceCents !== undefined) add("price_cents", Math.max(0, Number(body.priceCents) || 0));
    if (body.minNoticeHours !== undefined) add("min_notice_hours", Math.max(0, Math.min(168, Number(body.minNoticeHours) || 1)));
    if (body.maxAdvanceDays !== undefined) add("max_advance_days", Math.max(1, Math.min(365, Number(body.maxAdvanceDays) || 60)));
    if (body.cancellationHours !== undefined) add("cancellation_hours", Math.max(0, Math.min(168, Number(body.cancellationHours) || 24)));
    if (body.maxBookingsPerDay !== undefined) add("max_bookings_per_day", Math.max(0, Number(body.maxBookingsPerDay) || 0));
    if (body.slotIntervalMinutes !== undefined) add("slot_interval_minutes", Math.max(0, Number(body.slotIntervalMinutes) || 0));
    if (Array.isArray(body.customQuestions)) add("custom_questions", JSON.stringify(body.customQuestions));
    if (body.smartslotEnabled !== undefined) add("smartslot_enabled", body.smartslotEnabled ? 1 : 0);
    if (body.routingRuleId !== undefined) add("routing_rule_id", cleanText(body.routingRuleId, 80) || null);
    if (body.bookingPageTitle !== undefined) add("booking_page_title", cleanText(body.bookingPageTitle, 200) || null);
    if (body.bookingPageDescription !== undefined) add("booking_page_description", cleanText(body.bookingPageDescription, 1000) || null);
    if (!fields.length) return Response.json({ error: "No valid changes supplied." }, { status: 400 });
    add("updated_at", new Date().toISOString());
    values.push(id, tenant.tenantId);
    await coreDb().prepare(`UPDATE calendar_event_types SET ${fields.join(", ")} WHERE id = ? AND tenant_id = ?`).bind(...values).run();
    const eventType = await coreDb().prepare("SELECT * FROM calendar_event_types WHERE id = ? AND tenant_id = ?").bind(id, tenant.tenantId).first();
    return eventType ? Response.json({ eventType }) : Response.json({ error: "Event type not found." }, { status: 404 });
  } catch (error) {
    console.error("calendar.event_types.update_failed", error);
    return Response.json({ error: "Unable to update event type." }, { status: 500 });
  }
}
