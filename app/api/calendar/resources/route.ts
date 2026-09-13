import { cleanText, coreDb, ensureCoreSchema, hasModuleAccess } from "@/lib/core/db";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const { results } = await coreDb().prepare(
      "SELECT * FROM calendar_resources WHERE active = 1 ORDER BY resource_type, name"
    ).all();
    return Response.json({ resources: results });
  } catch (error) {
    console.error("calendar.resources.list_failed", error);
    return Response.json({ error: "Unable to load resources." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    const resourceType = cleanText(body.resourceType, 40).toUpperCase() || "ROOM";
    if (!name) return Response.json({ error: "Resource name is required." }, { status: 400 });
    if (!new Set(["ROOM", "VEHICLE", "EQUIPMENT", "PERSON", "VIRTUAL"]).has(resourceType))
      return Response.json({ error: "Invalid resource type." }, { status: 400 });
    const capacity = Math.max(1, Math.min(500, Number(body.capacity || 1)));
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await coreDb().prepare(
      `INSERT INTO calendar_resources (id, name, resource_type, description, location, capacity, color, active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).bind(id, name, resourceType, cleanText(body.description, 500) || null,
      cleanText(body.location, 300) || null, capacity,
      cleanText(body.color, 20) || "#C1283E", "system", now, now).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("calendar.resources.create_failed", error);
    return Response.json({ error: "Unable to create resource." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Resource id is required." }, { status: 400 });
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => { fields.push(`${col} = ?`); values.push(val); };
    if (body.name !== undefined) add("name", cleanText(body.name, 160));
    if (body.description !== undefined) add("description", cleanText(body.description, 500) || null);
    if (body.location !== undefined) add("location", cleanText(body.location, 300) || null);
    if (body.capacity !== undefined) add("capacity", Math.max(1, Math.min(500, Number(body.capacity || 1))));
    if (body.color !== undefined) add("color", cleanText(body.color, 20) || "#C1283E");
    if (body.active !== undefined) add("active", body.active ? 1 : 0);
    if (!fields.length) return Response.json({ error: "No changes provided." }, { status: 400 });
    add("updated_at", new Date().toISOString());
    values.push(id);
    await coreDb().prepare(`UPDATE calendar_resources SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    const resource = await coreDb().prepare("SELECT * FROM calendar_resources WHERE id = ?").bind(id).first();
    return resource ? Response.json({ resource }) : Response.json({ error: "Resource not found." }, { status: 404 });
  } catch (error) {
    console.error("calendar.resources.update_failed", error);
    return Response.json({ error: "Unable to update resource." }, { status: 500 });
  }
}
