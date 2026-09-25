/**
 * Automations (HighLevel-style workflows).
 * GET            → workflows with stats, recipes, channel status
 * GET ?id=       → one workflow + enrollments + recent events
 * POST           → create { name, trigger, triggerFilter?, steps } or { recipe }
 * POST ?action=enroll { workflowId, contactId } → run it for one contact now
 * POST ?action=run → process due waits now (cron does this every 5 minutes)
 * PATCH          → { id, name?, description?, trigger?, triggerFilter?, steps?, active? }
 * DELETE ?id=
 */
import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant, requireTenantAction } from "@/lib/core/tenantAuth";
import { emailTransportStatus } from "@/lib/core/email";
import { automationStats } from "@/lib/insights/stats";
import { BRANCHING, RECIPES, STEP_TYPES, TRIGGERS, enroll, enrollMany, parseWorkflowSettings, processDueEnrollments, runAutomationScans, runEnrollment, type Step, type Trigger } from "@/lib/automations/engine";
import { smsConfigured } from "@/lib/automations/sms";

const TRIGGER_SET = new Set<string>(TRIGGERS.map((t) => t[0]));
const STEP_SET = new Set<string>(STEP_TYPES.map((t) => t[0]));

function cleanSteps(raw: unknown, depth = 0): Step[] {
  if (!Array.isArray(raw) || depth > 4) return [];
  return raw.slice(0, 60).map((s) => {
    const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const type = cleanText(o.type, 24).toUpperCase();
    if (!STEP_SET.has(type)) return null;
    const out: Step = { type: type as Step["type"] };
    for (const [k, v] of Object.entries(o)) {
      if (k === "type") continue;
      if (k === "then" || k === "else") { if (BRANCHING.has(type)) out[k] = cleanSteps(v, depth + 1); continue; }
      if (typeof v === "string") out[k] = v.slice(0, 5000);
      else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
      else if (Array.isArray(v) && v.every((x) => typeof x === "number")) out[k] = v.slice(0, 7);
    }
    if (BRANCHING.has(type)) { out.then = out.then || []; out.else = out.else || []; }
    return out;
  }).filter((s): s is Step => Boolean(s));
}
const cleanFilter = (raw: unknown) => {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) { if (typeof v === "string") out[k] = v.slice(0, 200); else if (typeof v === "number") out[k] = v; }
  return out;
};

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const db = coreDb();
    const url = new URL(request.url);
    const id = cleanText(url.searchParams.get("id"), 80);
    if (url.searchParams.get("stats")) return Response.json(await automationStats(tenant.tenantId, Math.min(90, Math.max(7, Number(url.searchParams.get("days") || 30)))));
    if (id) {
      const workflow = await db.prepare("SELECT * FROM automation_workflows WHERE id=? AND tenant_id=?").bind(id, tenant.tenantId).first();
      if (!workflow) return Response.json({ error: "Workflow not found." }, { status: 404 });
      const enrollments = await db.prepare("SELECT e.*, c.full_name AS contact_name FROM automation_enrollments e LEFT JOIN crm_contacts c ON c.id=e.contact_id WHERE e.workflow_id=? ORDER BY e.started_at DESC LIMIT 100").bind(id).all();
      const events = await db.prepare("SELECT ev.*, c.full_name AS contact_name FROM automation_events ev LEFT JOIN crm_contacts c ON c.id=ev.contact_id WHERE ev.workflow_id=? ORDER BY ev.created_at DESC LIMIT 200").bind(id).all();
      return Response.json({ workflow, enrollments: enrollments.results, events: events.results });
    }
    const { results } = await db.prepare(`SELECT w.*,
        (SELECT COUNT(*) FROM automation_enrollments e WHERE e.workflow_id=w.id AND e.status='ACTIVE') AS active_enrollments,
        (SELECT COUNT(*) FROM automation_enrollments e WHERE e.workflow_id=w.id AND e.status='FAILED') AS failed_enrollments
      FROM automation_workflows w WHERE w.tenant_id=? ORDER BY w.updated_at DESC`).bind(tenant.tenantId).all();
    const recent = await db.prepare("SELECT ev.*, c.full_name AS contact_name, w.name AS workflow_name FROM automation_events ev LEFT JOIN crm_contacts c ON c.id=ev.contact_id JOIN automation_workflows w ON w.id=ev.workflow_id WHERE ev.tenant_id=? ORDER BY ev.created_at DESC LIMIT 60").bind(tenant.tenantId).all();
    const email = await emailTransportStatus(tenant.tenantId);
    return Response.json({
      workflows: results, events: recent.results,
      recipes: RECIPES.map((r) => ({ key: r.key, name: r.name, description: r.description, trigger: r.trigger, steps: r.steps.length, exitTrigger: r.exitTrigger || null })),
      triggers: TRIGGERS, stepTypes: STEP_TYPES, branching: [...BRANCHING],
      channels: { email: email.transport !== "none", emailTransport: email.transport, sms: smsConfigured() },
    });
  } catch (error) {
    console.error("automations.list_failed", error);
    return Response.json({ error: "Unable to load automations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "create");
    if (tenant instanceof Response) return tenant;
    const db = coreDb();
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const now = new Date().toISOString();

    if (action === "run") { const r = await processDueEnrollments(); const scans = await runAutomationScans(); return Response.json({ ...r, scans }); }
    if (action === "scan") return Response.json(await runAutomationScans());
    if (action === "enroll_many") {
      const workflowId = cleanText(body.workflowId, 80);
      const wf = await db.prepare("SELECT id FROM automation_workflows WHERE id=? AND tenant_id=?").bind(workflowId, tenant.tenantId).first();
      if (!wf) return Response.json({ error: "Workflow not found." }, { status: 404 });
      const f = (body.filter && typeof body.filter === "object" ? body.filter : {}) as Record<string, unknown>;
      const filter = { tag: cleanText(f.tag, 60), lifecycle: cleanText(f.lifecycle, 40), source: cleanText(f.source, 60), assignedRep: cleanText(f.assignedRep, 160), q: cleanText(f.q, 120), contactIds: Array.isArray(f.contactIds) ? (f.contactIds as unknown[]).map((x) => cleanText(x, 80)).filter(Boolean).slice(0, 500) : [] };
      const r = await enrollMany(tenant.tenantId, workflowId, filter, tenant.email);
      return Response.json(r, { status: 201 });
    }
    if (action === "enroll") {
      const workflowId = cleanText(body.workflowId, 80); const contactId = cleanText(body.contactId, 80);
      const wf = await db.prepare("SELECT id FROM automation_workflows WHERE id=? AND tenant_id=?").bind(workflowId, tenant.tenantId).first();
      const contact = await db.prepare("SELECT id FROM crm_contacts WHERE id=? AND tenant_id=?").bind(contactId, tenant.tenantId).first();
      if (!wf || !contact) return Response.json({ error: "Workflow or contact not found." }, { status: 404 });
      const id = await enroll(tenant.tenantId, workflowId, { contactId, trigger: "MANUAL", by: tenant.email });
      if (!id) return Response.json({ error: "That contact is already active in this workflow." }, { status: 409 });
      await runEnrollment(id);
      const en = await db.prepare("SELECT status, step_index, last_error FROM automation_enrollments WHERE id=?").bind(id).first();
      return Response.json({ enrolled: true, enrollmentId: id, enrollment: en }, { status: 201 });
    }

    let name = cleanText(body.name, 160); let description = cleanText(body.description, 500) || null;
    let trigger = cleanText(body.trigger, 40).toUpperCase(); let steps = cleanSteps(body.steps);
    let filter = cleanFilter(body.triggerFilter);
    let exitTrigger = cleanText(body.exitTrigger, 40).toUpperCase() || null;
    let settings = parseWorkflowSettings(body.settings);
    const recipeKey = cleanText(body.recipe, 40);
    if (recipeKey) {
      const recipe = RECIPES.find((r) => r.key === recipeKey);
      if (!recipe) return Response.json({ error: "Unknown recipe." }, { status: 400 });
      name = name || recipe.name; description = description || recipe.description; trigger = recipe.trigger; steps = recipe.steps; filter = recipe.filter || {}; exitTrigger = recipe.exitTrigger || null; settings = parseWorkflowSettings(recipe.settings || {});
    }
    if (exitTrigger && !TRIGGER_SET.has(exitTrigger)) return Response.json({ error: "Unknown goal trigger." }, { status: 400 });
    if (!name) return Response.json({ error: "Give the workflow a name." }, { status: 400 });
    if (!TRIGGER_SET.has(trigger)) return Response.json({ error: "Pick a trigger." }, { status: 400 });
    if (!steps.length) return Response.json({ error: "Add at least one step." }, { status: 400 });
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO automation_workflows (id,tenant_id,name,description,trigger,trigger_filter,steps,active,exit_trigger,settings_json,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?,?,?,?)")
      .bind(id, tenant.tenantId, name, description, trigger as Trigger, JSON.stringify(filter), JSON.stringify(steps), exitTrigger, JSON.stringify(settings), tenant.email, now, now).run();
    return Response.json({ id, name, trigger, steps }, { status: 201 });
  } catch (error) {
    console.error("automations.create_failed", error);
    return Response.json({ error: "Unable to save the workflow." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "edit");
    if (tenant instanceof Response) return tenant;
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Workflow id is required." }, { status: 400 });
    const fields: string[] = []; const values: unknown[] = [];
    if (body.name !== undefined) { const n = cleanText(body.name, 160); if (n) { fields.push("name=?"); values.push(n); } }
    if (body.description !== undefined) { fields.push("description=?"); values.push(cleanText(body.description, 500) || null); }
    if (body.trigger !== undefined) { const t = cleanText(body.trigger, 40).toUpperCase(); if (!TRIGGER_SET.has(t)) return Response.json({ error: "Unknown trigger." }, { status: 400 }); fields.push("trigger=?"); values.push(t); }
    if (body.triggerFilter !== undefined) { fields.push("trigger_filter=?"); values.push(JSON.stringify(cleanFilter(body.triggerFilter))); }
    if (body.exitTrigger !== undefined) { const x = cleanText(body.exitTrigger, 40).toUpperCase(); if (x && !TRIGGER_SET.has(x)) return Response.json({ error: "Unknown goal trigger." }, { status: 400 }); fields.push("exit_trigger=?"); values.push(x || null); }
    if (body.settings !== undefined) { fields.push("settings_json=?"); values.push(JSON.stringify(parseWorkflowSettings(body.settings))); }
    if (body.steps !== undefined) { const st = cleanSteps(body.steps); if (!st.length) return Response.json({ error: "Add at least one step." }, { status: 400 }); fields.push("steps=?"); values.push(JSON.stringify(st)); }
    if (body.active !== undefined) { fields.push("active=?"); values.push(body.active ? 1 : 0); }
    if (!fields.length) return Response.json({ updated: false });
    fields.push("updated_at=?"); values.push(new Date().toISOString(), id, tenant.tenantId);
    await coreDb().prepare(`UPDATE automation_workflows SET ${fields.join(",")} WHERE id=? AND tenant_id=?`).bind(...values).run();
    return Response.json({ updated: true });
  } catch (error) {
    console.error("automations.update_failed", error);
    return Response.json({ error: "Unable to update the workflow." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "delete");
    if (tenant instanceof Response) return tenant;
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Workflow id is required." }, { status: 400 });
    const db = coreDb();
    await db.batch([
      db.prepare("UPDATE automation_enrollments SET status='STOPPED', updated_at=? WHERE workflow_id=? AND tenant_id=? AND status='ACTIVE'").bind(new Date().toISOString(), id, tenant.tenantId),
      db.prepare("DELETE FROM automation_workflows WHERE id=? AND tenant_id=?").bind(id, tenant.tenantId),
    ]);
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("automations.delete_failed", error);
    return Response.json({ error: "Unable to delete the workflow." }, { status: 500 });
  }
}
