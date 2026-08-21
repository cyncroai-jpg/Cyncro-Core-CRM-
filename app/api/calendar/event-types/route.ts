import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";

export async function GET() {
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
      (id, name, slug, description, duration_minutes, buffer_before_minutes, buffer_after_minutes, capacity, location_modes, video_platforms, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, name, slug, cleanText(body.description, 1000) || null, duration,
        Math.max(0, Number(body.bufferBeforeMinutes || 0)), Math.max(0, Number(body.bufferAfterMinutes || 0)), capacity,
        JSON.stringify(Array.isArray(body.locationModes) ? body.locationModes : ["VIDEO"]),
        JSON.stringify(Array.isArray(body.videoPlatforms) ? body.videoPlatforms : ["GOOGLE_MEET", "ZOOM", "FACETIME"]), now, now).run();
    return Response.json({ id, slug }, { status: 201 });
  } catch (error) {
    console.error("calendar.event_types.create_failed", error);
    return Response.json({ error: "Unable to create event type. The booking-link slug may already exist." }, { status: 409 });
  }
}
