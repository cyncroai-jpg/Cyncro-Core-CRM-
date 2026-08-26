import { cleanText, coreDb, ensureCoreSchema, hasModuleAccess } from "@/lib/core/db";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const { results } = await coreDb().prepare("SELECT * FROM calendar_event_types WHERE active = 1 ORDER BY name").all();
    return Response.json({ eventTypes: results });
  } catch (error) {
    console.error("calendar.event_types.list_failed", error);
    return Response.json({ error: "Unable to load event types." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
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
    await coreDb().prepare(`INSERT INTO calendar_event_types
      (id, name, slug, description, duration_minutes, duration_options, buffer_before_minutes, buffer_after_minutes, capacity, location_modes, video_platforms, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, name, slug, cleanText(body.description, 1000) || null, duration, JSON.stringify([duration]),
        Math.max(0, Number(body.bufferBeforeMinutes || 0)), Math.max(0, Number(body.bufferAfterMinutes || 0)), capacity,
        JSON.stringify(Array.isArray(body.locationModes) ? body.locationModes : ["VIDEO"]),
        JSON.stringify(Array.isArray(body.videoPlatforms) ? body.videoPlatforms : ["GOOGLE_MEET", "ZOOM", "FACETIME"]), now, now).run();
    if (cleanText(body.hostName, 160)) await coreDb().prepare("UPDATE calendar_event_types SET host_name=? WHERE id=?").bind(cleanText(body.hostName,160),id).run();
    return Response.json({ id, slug }, { status: 201 });
  } catch (error) {
    console.error("calendar.event_types.create_failed", error);
    return Response.json({ error: "Unable to create event type. The booking-link slug may already exist." }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Event type id is required." }, { status: 400 });
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
    if (!fields.length) return Response.json({ error: "No valid changes supplied." }, { status: 400 });
    add("updated_at", new Date().toISOString());
    values.push(id);
    await coreDb().prepare(`UPDATE calendar_event_types SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    const eventType = await coreDb().prepare("SELECT * FROM calendar_event_types WHERE id = ?").bind(id).first();
    return eventType ? Response.json({ eventType }) : Response.json({ error: "Event type not found." }, { status: 404 });
  } catch (error) {
    console.error("calendar.event_types.update_failed", error);
    return Response.json({ error: "Unable to update event type." }, { status: 500 });
  }
}
