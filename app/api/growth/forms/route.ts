import { cleanText, coreDb, hasCrmAction, hasModuleAccess, requestUser } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";

const FORM_TYPES = new Set(["LEAD", "APPLICATION", "QUOTE", "CONTACT", "QUALIFICATION", "SURVEY", "APPOINTMENT", "FINANCING", "SERVICE", "CUSTOM"]);

export async function GET(request: Request) {
  try {
    await ensureGrowthSchema();
    const db = coreDb();
    const url = new URL(request.url);
    const token = cleanText(url.searchParams.get("token"), 120);
    if (token) {
      // Public: only what the renderer needs, never internal sync config.
      const form = await db.prepare("SELECT id, name, type, status, steps_json, style_json, thank_you_json FROM gi_forms WHERE public_token=?").bind(token).first();
      if (!form || form.status !== "PUBLISHED") return Response.json({ error: "This form is not available." }, { status: 404 });
      return Response.json({ form });
    }
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "Access required." }, { status: 403 });
    const id = cleanText(url.searchParams.get("id"), 80);
    if (id) {
      const form = await db.prepare("SELECT * FROM gi_forms WHERE id=?").bind(id).first();
      if (!form) return Response.json({ error: "Form not found." }, { status: 404 });
      return Response.json({ form });
    }
    const { results } = await db.prepare("SELECT id, name, type, status, public_token, views, starts, submissions, created_at, updated_at FROM gi_forms ORDER BY updated_at DESC").all();
    return Response.json({ forms: results });
  } catch (error) {
    console.error("growth.forms.list_failed", error);
    return Response.json({ error: "Unable to load forms." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "create"))) return Response.json({ error: "Create permission is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    if (!name) return Response.json({ error: "Form name is required." }, { status: 400 });
    const type = cleanText(body.type, 40).toUpperCase() || "LEAD";
    if (!FORM_TYPES.has(type)) return Response.json({ error: "Invalid form type." }, { status: 400 });
    const db = coreDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const publicToken = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    await db.prepare(`INSERT INTO gi_forms (id, name, type, status, public_token, steps_json, style_json, thank_you_json, sync_config_json, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, name, type, "DRAFT", publicToken,
        JSON.stringify(body.steps || [{ id: crypto.randomUUID(), title: "Get in touch", fields: [] }]),
        JSON.stringify(body.style || {}), JSON.stringify(body.thankYou || { message: "Thanks — we'll be in touch shortly." }),
        JSON.stringify(body.syncConfig || { createOpportunity: true }), requestUser(request), now, now).run();
    const form = await db.prepare("SELECT * FROM gi_forms WHERE id=?").bind(id).first();
    return Response.json({ form }, { status: 201 });
  } catch (error) {
    console.error("growth.forms.create_failed", error);
    return Response.json({ error: "Unable to create form." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "edit"))) return Response.json({ error: "Edit permission is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Form id is required." }, { status: 400 });
    const updates = (body.updates && typeof body.updates === "object" ? body.updates : {}) as Record<string, unknown>;
    const fields: string[] = []; const values: unknown[] = [];
    const add = (column: string, value: unknown) => { fields.push(`${column} = ?`); values.push(value); };
    if (updates.name !== undefined) { const v = cleanText(updates.name, 160); if (!v) return Response.json({ error: "Form name is required." }, { status: 400 }); add("name", v); }
    if (updates.type !== undefined) { const v = cleanText(updates.type, 40).toUpperCase(); if (!FORM_TYPES.has(v)) return Response.json({ error: "Invalid form type." }, { status: 400 }); add("type", v); }
    if (updates.status !== undefined) { const v = cleanText(updates.status, 20).toUpperCase(); if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(v)) return Response.json({ error: "Invalid status." }, { status: 400 }); add("status", v); }
    if (updates.steps !== undefined) add("steps_json", JSON.stringify(updates.steps));
    if (updates.style !== undefined) add("style_json", JSON.stringify(updates.style));
    if (updates.thankYou !== undefined) add("thank_you_json", JSON.stringify(updates.thankYou));
    if (updates.syncConfig !== undefined) add("sync_config_json", JSON.stringify(updates.syncConfig));
    if (!fields.length) return Response.json({ error: "No valid changes supplied." }, { status: 400 });
    add("updated_at", new Date().toISOString()); values.push(id);
    const db = coreDb();
    await db.prepare(`UPDATE gi_forms SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    const form = await db.prepare("SELECT * FROM gi_forms WHERE id=?").bind(id).first();
    return form ? Response.json({ form }) : Response.json({ error: "Form not found." }, { status: 404 });
  } catch (error) {
    console.error("growth.forms.update_failed", error);
    return Response.json({ error: "Unable to update form." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "delete"))) return Response.json({ error: "Delete permission is required." }, { status: 403 });
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Form id is required." }, { status: 400 });
    const db = coreDb();
    const existing = await db.prepare("SELECT id FROM gi_forms WHERE id=?").bind(id).first();
    if (!existing) return Response.json({ error: "Form not found." }, { status: 404 });
    await db.prepare("DELETE FROM gi_forms WHERE id=?").bind(id).run();
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("growth.forms.delete_failed", error);
    return Response.json({ error: "Unable to delete form." }, { status: 500 });
  }
}
