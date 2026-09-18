import { cleanText, coreDb, hasCrmAction, hasModuleAccess, requestUser } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";

export async function GET(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "Access required." }, { status: 403 });
    const db = coreDb();
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (id) {
      const automation = await db.prepare("SELECT * FROM gi_automations WHERE id=?").bind(id).first();
      return automation ? Response.json({ automation }) : Response.json({ error: "Not found." }, { status: 404 });
    }
    const { results } = await db.prepare("SELECT id, name, status, run_count, created_at, updated_at FROM gi_automations ORDER BY updated_at DESC").all();
    return Response.json({ automations: results });
  } catch (error) {
    console.error("growth.automations.list_failed", error);
    return Response.json({ error: "Unable to load automations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "create"))) return Response.json({ error: "Create permission is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    if (!name) return Response.json({ error: "Automation name is required." }, { status: 400 });
    const db = coreDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const defaultNodes = [{ id: "trigger-1", type: "trigger", data: { event: "FORM_SUBMITTED" }, position: { x: 60, y: 120 } }];
    await db.prepare(`INSERT INTO gi_automations (id, name, status, nodes_json, edges_json, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(id, name, "DRAFT", JSON.stringify(body.nodes || defaultNodes), JSON.stringify(body.edges || []), requestUser(request), now, now).run();
    const automation = await db.prepare("SELECT * FROM gi_automations WHERE id=?").bind(id).first();
    return Response.json({ automation }, { status: 201 });
  } catch (error) {
    console.error("growth.automations.create_failed", error);
    return Response.json({ error: "Unable to create automation." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "edit"))) return Response.json({ error: "Edit permission is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Automation id is required." }, { status: 400 });
    const updates = (body.updates && typeof body.updates === "object" ? body.updates : {}) as Record<string, unknown>;
    const fields: string[] = []; const values: unknown[] = [];
    const add = (column: string, value: unknown) => { fields.push(`${column} = ?`); values.push(value); };
    if (updates.name !== undefined) { const v = cleanText(updates.name, 160); if (!v) return Response.json({ error: "Automation name is required." }, { status: 400 }); add("name", v); }
    if (updates.status !== undefined) { const v = cleanText(updates.status, 20).toUpperCase(); if (!["DRAFT", "ACTIVE", "PAUSED"].includes(v)) return Response.json({ error: "Invalid status." }, { status: 400 }); add("status", v); }
    if (updates.nodes !== undefined) add("nodes_json", JSON.stringify(updates.nodes));
    if (updates.edges !== undefined) add("edges_json", JSON.stringify(updates.edges));
    if (!fields.length) return Response.json({ error: "No valid changes supplied." }, { status: 400 });
    add("updated_at", new Date().toISOString()); values.push(id);
    const db = coreDb();
    await db.prepare(`UPDATE gi_automations SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    const automation = await db.prepare("SELECT * FROM gi_automations WHERE id=?").bind(id).first();
    return automation ? Response.json({ automation }) : Response.json({ error: "Automation not found." }, { status: 404 });
  } catch (error) {
    console.error("growth.automations.update_failed", error);
    return Response.json({ error: "Unable to update automation." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "delete"))) return Response.json({ error: "Delete permission is required." }, { status: 403 });
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Automation id is required." }, { status: 400 });
    await coreDb().prepare("DELETE FROM gi_automations WHERE id=?").bind(id).run();
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("growth.automations.delete_failed", error);
    return Response.json({ error: "Unable to delete automation." }, { status: 500 });
  }
}
