/**
 * Real automation rule CRUD + run history for the CRM.
 *
 * GET  /api/crm/automations — list rules with their last-10 runs each
 * POST /api/crm/automations — create a rule
 * PATCH /api/crm/automations — { id, active? } toggle, or { id, updates: {...} } edit
 * DELETE /api/crm/automations?id=X — delete a rule (keeps its run history)
 */
import { cleanText, coreDb, ensureCoreSchema, hasModuleAccess, requestUser } from "@/lib/core/db";
import type { AutomationActionType, AutomationTriggerEvent } from "@/lib/core/automations";

const TRIGGER_EVENTS = new Set<AutomationTriggerEvent>(["CONTACT_CREATED", "OPPORTUNITY_STAGE_CHANGED", "OPPORTUNITY_WON", "OPPORTUNITY_LOST"]);
const ACTION_TYPES = new Set<AutomationActionType>(["CREATE_TASK", "ADD_ACTIVITY_NOTE", "ASSIGN_REP"]);

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "CRM access required." }, { status: 403 });
    const db = coreDb();
    const { results: rules } = await db.prepare("SELECT * FROM crm_automation_rules ORDER BY created_at DESC").all();
    const { results: runs } = await db.prepare("SELECT * FROM crm_automation_runs ORDER BY created_at DESC LIMIT 100").all();
    return Response.json({ rules, runs });
  } catch (error) {
    console.error("crm.automations.list_failed", error);
    return Response.json({ error: "Unable to load automations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "CRM access required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    const triggerEvent = cleanText(body.triggerEvent, 40).toUpperCase() as AutomationTriggerEvent;
    const actionType = cleanText(body.actionType, 40).toUpperCase() as AutomationActionType;
    if (!name) return Response.json({ error: "Rule name is required." }, { status: 400 });
    if (!TRIGGER_EVENTS.has(triggerEvent)) return Response.json({ error: "Unknown trigger event." }, { status: 400 });
    if (!ACTION_TYPES.has(actionType)) return Response.json({ error: "Unknown action type." }, { status: 400 });
    const triggerFilter = body.triggerFilter && typeof body.triggerFilter === "object" ? body.triggerFilter : {};
    const actionConfig = body.actionConfig && typeof body.actionConfig === "object" ? body.actionConfig : {};
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await coreDb().prepare(`INSERT INTO crm_automation_rules (id,name,trigger_event,trigger_filter,action_type,action_config,active,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,1,?,?,?)`)
      .bind(id, name, triggerEvent, JSON.stringify(triggerFilter), actionType, JSON.stringify(actionConfig), requestUser(request), now, now).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("crm.automations.create_failed", error);
    return Response.json({ error: "Unable to create automation rule." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "CRM access required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Rule id is required." }, { status: 400 });
    const db = coreDb();
    const fields: string[] = [];
    const values: unknown[] = [];
    if (body.active !== undefined) { fields.push("active=?"); values.push(body.active ? 1 : 0); }
    const updates = body.updates && typeof body.updates === "object" ? body.updates as Record<string, unknown> : {};
    if (updates.name !== undefined) { fields.push("name=?"); values.push(cleanText(updates.name, 160)); }
    if (updates.triggerFilter !== undefined) { fields.push("trigger_filter=?"); values.push(JSON.stringify(updates.triggerFilter)); }
    if (updates.actionConfig !== undefined) { fields.push("action_config=?"); values.push(JSON.stringify(updates.actionConfig)); }
    if (!fields.length) return Response.json({ updated: false });
    fields.push("updated_at=?"); values.push(new Date().toISOString(), id);
    await db.prepare(`UPDATE crm_automation_rules SET ${fields.join(",")} WHERE id=?`).bind(...values).run();
    return Response.json({ updated: true });
  } catch (error) {
    console.error("crm.automations.update_failed", error);
    return Response.json({ error: "Unable to update automation rule." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "CRM access required." }, { status: 403 });
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Rule id is required." }, { status: 400 });
    await coreDb().prepare("DELETE FROM crm_automation_rules WHERE id=?").bind(id).run();
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("crm.automations.delete_failed", error);
    return Response.json({ error: "Unable to delete automation rule." }, { status: 500 });
  }
}
