/**
 * Cyncro automation engine — HighLevel-class workflows.
 *
 * A workflow = one trigger + an optional filter + a tree of steps. Steps are a
 * list; IF_ELSE, SPLIT_TEST and WAIT_FOR carry nested `then` / `else` lists.
 * An enrollment keeps a cursor (a path into that tree) so it can pause inside
 * a branch (WAIT, WAIT_UNTIL, WAIT_FOR an event, business-hours holds) and the
 * scheduler picks it up later. Every step writes a log row, so the Automations
 * tab shows exactly what happened, never a claimed count.
 *
 * Goals: a workflow can name an `exit_trigger`; when that event fires for a
 * contact, their active enrollment stops as GOAL_REACHED.
 */
import { coreDb } from "@/lib/core/db";
import { emailTransportStatus, sendEmail } from "@/lib/core/email";
import { sendSms, smsConfigured } from "@/lib/automations/sms";
import { companySettings, nextBusinessMoment, nextLocalTime, withinBusinessHours, type CompanySettings } from "@/lib/core/companySettings";

export const TRIGGERS = [
  ["CONTACT_CREATED", "New contact or lead created"],
  ["CONTACT_UPDATED", "Contact updated (lifecycle, rep, email, phone)"],
  ["FORM_SUBMITTED", "Form submitted"],
  ["INBOUND_SMS", "Customer texted in"],
  ["BOOKING_CREATED", "Appointment booked"],
  ["BOOKING_UPCOMING", "Appointment coming up (reminder)"],
  ["BOOKING_CANCELLED", "Appointment cancelled"],
  ["BOOKING_NO_SHOW", "Appointment no-show"],
  ["BOOKING_COMPLETED", "Appointment completed"],
  ["DEAL_STAGE_CHANGED", "Deal moved to a stage"],
  ["DEAL_STALE", "Deal sat in a stage too long"],
  ["DEAL_WON", "Deal won"],
  ["DEAL_LOST", "Deal lost"],
  ["TAG_ADDED", "Tag added to contact"],
  ["TASK_COMPLETED", "Task completed"],
  ["JOB_COMPLETED", "Dispatch job completed"],
  ["INVOICE_PAID", "Invoice paid"],
  ["INVOICE_OVERDUE", "Invoice overdue"],
  ["MANUAL", "Added by a teammate"],
] as const;
export type Trigger = (typeof TRIGGERS)[number][0];
export const TRIGGER_SET = new Set<string>(TRIGGERS.map((t) => t[0]));

export const STEP_TYPES = [
  ["SEND_EMAIL", "Send email"], ["SEND_SMS", "Send text"], ["SEND_BOOKING_LINK", "Send booking link"],
  ["WAIT", "Wait"], ["WAIT_UNTIL", "Wait until a time"], ["WAIT_FOR", "Wait for an event"],
  ["IF", "Continue only if"], ["IF_ELSE", "If / else branch"], ["SPLIT_TEST", "A/B split"],
  ["ADD_TAG", "Add tag"], ["REMOVE_TAG", "Remove tag"], ["UPDATE_FIELD", "Update contact field"], ["LEAD_SCORE", "Adjust lead score"],
  ["CREATE_TASK", "Create task"], ["ADD_NOTE", "Add note"], ["CREATE_DEAL", "Create deal"], ["MOVE_STAGE", "Move deal to stage"], ["SET_LIFECYCLE", "Set lifecycle"],
  ["ASSIGN_REP", "Assign to teammate"], ["ROUND_ROBIN", "Assign round-robin"], ["NOTIFY_TEAM", "Notify teammate"], ["POST_TO_CHAT", "Post to Team Chat"],
  ["ENROLL_WORKFLOW", "Start another workflow"], ["REMOVE_FROM_WORKFLOW", "Stop other workflows"], ["WEBHOOK", "Send webhook"], ["END", "End workflow"],
] as const;
export type StepType = (typeof STEP_TYPES)[number][0];
export const STEP_SET = new Set<string>(STEP_TYPES.map((s) => s[0]));
export type Step = { type: StepType; then?: Step[]; else?: Step[]; [key: string]: unknown };
export const BRANCHING = new Set<string>(["IF_ELSE", "SPLIT_TEST", "WAIT_FOR"]);

export type WorkflowSettings = { reenroll: "active" | "once" | "always"; businessHoursOnly: boolean };
export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = { reenroll: "active", businessHoursOnly: false };
export function parseWorkflowSettings(raw: unknown): WorkflowSettings {
  const o = parseJson<Record<string, unknown>>(raw, {});
  return { reenroll: o.reenroll === "once" || o.reenroll === "always" ? o.reenroll : "active", businessHoursOnly: Boolean(o.businessHoursOnly) };
}

type Ctx = Record<string, unknown>;
type Cursor = (number | "then" | "else")[];
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
function parseJson<T>(raw: unknown, fallback: T): T { try { return raw ? (typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T)) : fallback; } catch { return fallback; } }
function appOrigin(): string {
  try { const v = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env?.APP_URL; if (v) return v.replace(/\/$/, ""); } catch { /* not node */ }
  return "https://cyncro-core-crm.cyncroai-685.workers.dev";
}

/** Simple equality filter: every non-empty key in the filter must equal the context value (numbers compare numerically). */
function matches(filter: Record<string, unknown>, ctx: Ctx) {
  return Object.entries(filter).every(([k, v]) => v === undefined || v === null || v === "" || str(ctx[k]).toLowerCase() === str(v).toLowerCase());
}

/** Merge-friendly variables for {{contact.first_name}}, {{booking.time}}, {{company.name}}, {{rep}} … */
async function buildVars(tenantId: string, ctx: Ctx) {
  const db = coreDb();
  const vars: Record<string, string> = {};
  const contactId = str(ctx.contactId);
  let contact: Record<string, unknown> | null = null;
  if (contactId) {
    contact = await db.prepare("SELECT c.*, a.name AS company_name FROM crm_contacts c LEFT JOIN crm_accounts a ON a.id=c.account_id WHERE c.id=? AND c.tenant_id=?").bind(contactId, tenantId).first<Record<string, unknown>>();
  }
  const tenant = await db.prepare("SELECT name FROM tenants WHERE id=?").bind(tenantId).first<{ name: string }>();
  const settings = await companySettings(tenantId);
  const fullName = str(contact?.full_name || ctx.customerName || ctx.name || "there");
  vars["contact.name"] = fullName;
  vars["contact.first_name"] = fullName.split(" ")[0] || "there";
  vars["contact.email"] = str(contact?.email || ctx.customerEmail || "");
  vars["contact.phone"] = str(contact?.phone || ctx.customerPhone || "");
  vars["contact.company"] = str(contact?.company_name || "");
  vars["contact.title"] = str(contact?.title || "");
  vars["contact.score"] = str(contact?.lead_score ?? 0);
  vars["contact.lifecycle"] = str(contact?.lifecycle || "");
  vars["company.name"] = str(tenant?.name || "our team");
  vars["company.phone"] = settings.phone; vars["company.website"] = settings.website; vars["company.address"] = settings.address;
  vars["rep"] = str(contact?.assigned_rep || ctx.assignedTo || ctx.assignedRep || "");
  vars["booking.time"] = ctx.startsAt ? new Date(str(ctx.startsAt)).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: settings.timezone }) : "";
  vars["booking.event"] = str(ctx.eventName || "");
  vars["booking.link"] = `${appOrigin()}/?${ctx.eventSlug ? `event=${encodeURIComponent(str(ctx.eventSlug))}&` : ""}name=${encodeURIComponent(fullName === "there" ? "" : fullName)}&email=${encodeURIComponent(vars["contact.email"])}#book`;
  vars["deal.name"] = str(ctx.dealName || "");
  vars["deal.stage"] = str(ctx.stage || "");
  vars["deal.value"] = ctx.valueCents !== undefined ? `$${(Number(ctx.valueCents) / 100).toLocaleString()}` : "";
  vars["job.service"] = str(ctx.serviceType || "");
  vars["invoice.amount"] = ctx.amountCents !== undefined ? `$${(Number(ctx.amountCents) / 100).toLocaleString()}` : "";
  vars["invoice.number"] = str(ctx.invoiceNumber || "");
  vars["task.title"] = str(ctx.taskTitle || "");
  vars["sms.body"] = str(ctx.body || "");
  vars["tag"] = str(ctx.tag || "");
  return { vars, contact, settings };
}
export function render(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*([a-z_.]+)\s*\}\}/gi, (_, key: string) => vars[key] ?? "");
}

/** Fire an event: stop enrollments whose goal this is, wake WAIT_FOR steps, then enroll every active workflow on this trigger. */
export async function emitAutomationEvent(tenantId: string, trigger: Trigger, ctx: Ctx): Promise<number> {
  try {
    const db = coreDb();
    const contactId = str(ctx.contactId) || null;
    if (contactId) {
      // Goals reached
      const { results: goals } = await db.prepare("SELECT e.id, e.workflow_id FROM automation_enrollments e JOIN automation_workflows w ON w.id=e.workflow_id WHERE e.tenant_id=? AND e.contact_id=? AND e.status='ACTIVE' AND w.exit_trigger=?").bind(tenantId, contactId, trigger).all<{ id: string; workflow_id: string }>();
      for (const g of goals) {
        await db.prepare("UPDATE automation_enrollments SET status='DONE', next_run_at=NULL, wait_for=NULL, updated_at=? WHERE id=?").bind(now(), g.id).run();
        await db.prepare("UPDATE automation_workflows SET completed_count=completed_count+1 WHERE id=?").bind(g.workflow_id).run();
        await log(tenantId, g.workflow_id, g.id, contactId, null, "GOAL_REACHED", `Goal reached: ${trigger}`);
      }
      // Waiting-for steps
      const { results: waiting } = await db.prepare("SELECT id FROM automation_enrollments WHERE tenant_id=? AND contact_id=? AND status='ACTIVE' AND wait_for=?").bind(tenantId, contactId, trigger).all<{ id: string }>();
      for (const w of waiting) {
        await db.prepare("UPDATE automation_enrollments SET wait_for=NULL, next_run_at=NULL, context=json_patch(context, ?), updated_at=? WHERE id=?").bind(JSON.stringify({ __waitOutcome: "then", __waitEvent: ctx }), now(), w.id).run();
        await runEnrollment(w.id);
      }
    }
    const { results } = await db.prepare("SELECT * FROM automation_workflows WHERE tenant_id=? AND trigger=? AND active=1").bind(tenantId, trigger).all<Record<string, unknown>>();
    let enrolled = 0;
    for (const wf of results) {
      if (!matches(parseJson<Record<string, unknown>>(wf.trigger_filter, {}), ctx)) continue;
      const id = await enroll(tenantId, String(wf.id), ctx);
      if (id) { enrolled++; await runEnrollment(id); }
    }
    return enrolled;
  } catch (error) {
    console.error("automations.emit_failed", trigger, error);
    return 0;
  }
}

/** Create an enrollment, honoring the workflow's re-enrollment rule. */
export async function enroll(tenantId: string, workflowId: string, ctx: Ctx): Promise<string | null> {
  const db = coreDb();
  const contactId = str(ctx.contactId) || null;
  if (contactId) {
    const wf = await db.prepare("SELECT settings_json FROM automation_workflows WHERE id=?").bind(workflowId).first<{ settings_json: string | null }>();
    const rule = parseWorkflowSettings(wf?.settings_json).reenroll;
    if (rule !== "always") {
      const dup = await db.prepare(`SELECT id FROM automation_enrollments WHERE workflow_id=? AND contact_id=?${rule === "active" ? " AND status='ACTIVE'" : ""} LIMIT 1`).bind(workflowId, contactId).first();
      if (dup) return null;
    }
  }
  const id = uid(); const t = now();
  await db.batch([
    db.prepare("INSERT INTO automation_enrollments (id,tenant_id,workflow_id,contact_id,context,step_index,cursor,status,next_run_at,started_at,updated_at) VALUES (?,?,?,?,?,0,'[0]','ACTIVE',?,?,?)").bind(id, tenantId, workflowId, contactId, JSON.stringify(ctx), t, t, t),
    db.prepare("UPDATE automation_workflows SET enrolled_count=enrolled_count+1, last_run_at=?, updated_at=? WHERE id=?").bind(t, t, workflowId),
    db.prepare("INSERT INTO automation_events (id,tenant_id,workflow_id,enrollment_id,contact_id,step_index,kind,detail,created_at) VALUES (?,?,?,?,?,NULL,'ENROLLED',?,?)").bind(uid(), tenantId, workflowId, id, contactId, `Trigger ${str(ctx.trigger || "")}`.trim(), t),
  ]);
  return id;
}

/** Bulk enroll: every contact in the company matching the filter. Returns how many were enrolled and how many were skipped by the re-enroll rule. */
export async function enrollMany(tenantId: string, workflowId: string, filter: { tag?: string; lifecycle?: string; source?: string; assignedRep?: string; q?: string; contactIds?: string[] }, by: string, limit = 500): Promise<{ enrolled: number; skipped: number; matched: number }> {
  const db = coreDb();
  const where: string[] = ["tenant_id=?"]; const binds: unknown[] = [tenantId];
  if (filter.lifecycle) { where.push("upper(lifecycle)=?"); binds.push(filter.lifecycle.toUpperCase()); }
  if (filter.source) { where.push("upper(source)=?"); binds.push(filter.source.toUpperCase()); }
  if (filter.assignedRep) { where.push("lower(assigned_rep)=?"); binds.push(filter.assignedRep.toLowerCase()); }
  if (filter.tag) { where.push("lower(COALESCE(tags,'')) LIKE ?"); binds.push(`%"${filter.tag.toLowerCase()}"%`); }
  if (filter.q) { where.push("(lower(full_name) LIKE ? OR lower(COALESCE(email,'')) LIKE ?)"); binds.push(`%${filter.q.toLowerCase()}%`, `%${filter.q.toLowerCase()}%`); }
  if (filter.contactIds?.length) { where.push(`id IN (${filter.contactIds.map(() => "?").join(",")})`); binds.push(...filter.contactIds); }
  const { results } = await db.prepare(`SELECT id FROM crm_contacts WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`).bind(...binds, limit).all<{ id: string }>();
  let enrolled = 0, skipped = 0;
  for (const c of results) {
    const id = await enroll(tenantId, workflowId, { contactId: c.id, trigger: "MANUAL", by, bulk: true });
    if (!id) { skipped++; continue; }
    enrolled++; await runEnrollment(id);
  }
  return { enrolled, skipped, matched: results.length };
}

async function log(tenantId: string, workflowId: string, enrollmentId: string, contactId: string | null, stepIndex: number | null, kind: string, detail: string) {
  await coreDb().prepare("INSERT INTO automation_events (id,tenant_id,workflow_id,enrollment_id,contact_id,step_index,kind,detail,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(uid(), tenantId, workflowId, enrollmentId, contactId, stepIndex, kind, detail.slice(0, 500), now()).run();
}

/** Resolve a cursor path to the list it points into and the index within it. */
function resolve(steps: Step[], cursor: Cursor): { list: Step[]; idx: number } {
  let list = steps;
  for (let i = 0; i + 2 < cursor.length; i += 2) {
    const parent = list[Number(cursor[i])];
    const branch = cursor[i + 1] as "then" | "else";
    list = (parent && Array.isArray(parent[branch]) ? (parent[branch] as Step[]) : []);
  }
  return { list, idx: Number(cursor[cursor.length - 1]) };
}
const stepLabel = (cursor: Cursor) => cursor.filter((c) => typeof c === "number").map((c) => Number(c) + 1).join(".");

/** Run steps from the enrollment's cursor until a wait, END, failure or the last step. */
export async function runEnrollment(enrollmentId: string): Promise<void> {
  const db = coreDb();
  const en = await db.prepare("SELECT * FROM automation_enrollments WHERE id=? AND status='ACTIVE'").bind(enrollmentId).first<Record<string, unknown>>();
  if (!en) return;
  const wf = await db.prepare("SELECT * FROM automation_workflows WHERE id=?").bind(String(en.workflow_id)).first<Record<string, unknown>>();
  if (!wf || !Number(wf.active)) { await db.prepare("UPDATE automation_enrollments SET status='STOPPED', updated_at=? WHERE id=?").bind(now(), enrollmentId).run(); return; }
  const tenantId = String(en.tenant_id); const workflowId = String(wf.id); const contactId = en.contact_id ? String(en.contact_id) : null;
  const steps = parseJson<Step[]>(wf.steps, []);
  const wfSettings = parseWorkflowSettings(wf.settings_json);
  const ctx = parseJson<Ctx>(en.context, {});
  let cursor = parseJson<Cursor>(en.cursor, [Number(en.step_index || 0)]);
  if (!cursor.length) cursor = [0];
  const saveCursor = async (extra: Record<string, unknown> = {}) => {
    const sets = ["cursor=?", "step_index=?", "updated_at=?"]; const vals: unknown[] = [JSON.stringify(cursor), Number(cursor[0]) || 0, now()];
    for (const [k, v] of Object.entries(extra)) { sets.push(`${k}=?`); vals.push(v); }
    vals.push(enrollmentId);
    await db.prepare(`UPDATE automation_enrollments SET ${sets.join(", ")} WHERE id=?`).bind(...vals).run();
  };
  const finish = async (status: "DONE" | "STOPPED" | "FAILED", detail: string) => {
    await db.batch([
      db.prepare("UPDATE automation_enrollments SET status=?, next_run_at=NULL, wait_for=NULL, last_error=?, updated_at=? WHERE id=?").bind(status, status === "FAILED" ? detail : null, now(), enrollmentId),
      ...(status === "DONE" ? [db.prepare("UPDATE automation_workflows SET completed_count=completed_count+1, updated_at=? WHERE id=?").bind(now(), workflowId)] : []),
    ]);
    await log(tenantId, workflowId, enrollmentId, contactId, Number(cursor[0]) || 0, status, detail);
  };
  const { vars, contact, settings } = await buildVars(tenantId, ctx);
  const state = { tenantId, workflowId, enrollmentId, ctx, vars, contact, contactId, settings };

  // A WAIT_FOR that just resolved (event arrived, or timed out) continues into its then/else branch.
  const outcome = ctx.__waitOutcome as "then" | "else" | undefined;
  if (outcome) {
    delete ctx.__waitOutcome;
    const { list, idx } = resolve(steps, cursor);
    const st = list[idx];
    if (st && st.type === "WAIT_FOR") {
      await log(tenantId, workflowId, enrollmentId, contactId, Number(cursor[0]) || 0, "WAIT_FOR", outcome === "then" ? `Event arrived: ${str(st.event)}` : `Timed out waiting for ${str(st.event)}`);
      cursor = [...cursor, outcome, 0];
    }
    await saveCursor({ context: JSON.stringify(ctx) });
  }

  for (let guard = 0; guard < 500; guard++) {
    const { list, idx } = resolve(steps, cursor);
    if (idx >= list.length) {
      if (cursor.length > 2) { cursor = cursor.slice(0, -2); cursor[cursor.length - 1] = Number(cursor[cursor.length - 1]) + 1; continue; }
      await finish("DONE", "All steps completed"); return;
    }
    const step = list[idx];
    const label = stepLabel(cursor);
    const advance = async (branch?: "then" | "else") => { cursor = branch ? [...cursor, branch, 0] : [...cursor.slice(0, -1), idx + 1]; await saveCursor(); };
    try {
      if (step.type === "WAIT") {
        const amount = Math.max(0, Number(step.amount || 0)); const unit = str(step.unit || "hours");
        const ms = amount * (unit === "minutes" ? 60_000 : unit === "days" ? 86_400_000 : 3_600_000);
        const next = new Date(Date.now() + ms).toISOString();
        cursor = [...cursor.slice(0, -1), idx + 1];
        await saveCursor({ next_run_at: next });
        await log(tenantId, workflowId, enrollmentId, contactId, Number(cursor[0]) || 0, "WAIT", `Waiting ${amount} ${unit} · resumes ${next}`);
        return;
      }
      if (step.type === "WAIT_UNTIL") {
        const days = Array.isArray(step.days) ? (step.days as unknown[]).map(Number).filter((d) => d >= 0 && d <= 6) : [];
        const at = step.businessHours ? nextBusinessMoment(new Date(), settings) : nextLocalTime(new Date(), /^\d{2}:\d{2}$/.test(str(step.time)) ? str(step.time) : "09:00", days, settings.timezone);
        cursor = [...cursor.slice(0, -1), idx + 1];
        if (at.getTime() - Date.now() < 30_000) { await saveCursor(); await log(tenantId, workflowId, enrollmentId, contactId, Number(cursor[0]) || 0, "WAIT_UNTIL", "Already inside the window · continuing"); continue; }
        await saveCursor({ next_run_at: at.toISOString() });
        await log(tenantId, workflowId, enrollmentId, contactId, Number(cursor[0]) || 0, "WAIT_UNTIL", `Holding until ${at.toLocaleString([], { timeZone: settings.timezone, weekday: "short", hour: "numeric", minute: "2-digit" })} (${settings.timezone})`);
        return;
      }
      if (step.type === "WAIT_FOR") {
        const event = str(step.event || "BOOKING_CREATED");
        const amount = Math.max(0, Number(step.amount ?? 3)); const unit = str(step.unit || "days");
        const ms = amount * (unit === "minutes" ? 60_000 : unit === "days" ? 86_400_000 : 3_600_000);
        const next = new Date(Date.now() + ms).toISOString();
        await saveCursor({ next_run_at: next, wait_for: event });
        await log(tenantId, workflowId, enrollmentId, contactId, Number(cursor[0]) || 0, "WAIT_FOR", `Waiting up to ${amount} ${unit} for ${event}`);
        return;
      }
      if (step.type === "END") { await finish("DONE", "Reached End"); return; }
      if (step.type === "IF_ELSE") {
        const ok = evaluate(step, state);
        await log(tenantId, workflowId, enrollmentId, contactId, Number(cursor[0]) || 0, "IF_ELSE", ok ? `Condition met (step ${label}) → yes branch` : `Condition not met (step ${label}) → no branch`);
        await advance(ok ? "then" : "else"); continue;
      }
      if (step.type === "SPLIT_TEST") {
        const pct = Math.min(100, Math.max(0, Number(step.percentA ?? 50)));
        const a = Math.random() * 100 < pct;
        await log(tenantId, workflowId, enrollmentId, contactId, Number(cursor[0]) || 0, "SPLIT_TEST", a ? `Variant A (${pct}%)` : `Variant B (${100 - pct}%)`);
        await advance(a ? "then" : "else"); continue;
      }
      if ((step.type === "SEND_EMAIL" || step.type === "SEND_SMS" || step.type === "SEND_BOOKING_LINK") && wfSettings.businessHoursOnly && !withinBusinessHours(new Date(), settings)) {
        const at = nextBusinessMoment(new Date(), settings);
        await saveCursor({ next_run_at: at.toISOString() });
        await log(tenantId, workflowId, enrollmentId, contactId, Number(cursor[0]) || 0, "HOLD", `Outside business hours · sends ${at.toLocaleString([], { timeZone: settings.timezone, weekday: "short", hour: "numeric", minute: "2-digit" })}`);
        return;
      }
      const detail = await execute(step, state);
      if (detail === "__STOP__") { await finish("STOPPED", `Condition not met at step ${label}`); return; }
      await log(tenantId, workflowId, enrollmentId, contactId, Number(cursor[0]) || 0, step.type, detail);
      await advance();
    } catch (error) {
      await finish("FAILED", `${step.type}: ${error instanceof Error ? error.message : "failed"}`);
      return;
    }
  }
  await finish("FAILED", "Step limit reached");
}

/** Cron entry: resume every enrollment whose wait is over (timed-out WAIT_FOR steps take their else branch). */
export async function processDueEnrollments(limit = 200): Promise<{ resumed: number }> {
  const db = coreDb();
  const { results } = await db.prepare("SELECT id, wait_for FROM automation_enrollments WHERE status='ACTIVE' AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at LIMIT ?").bind(now(), limit).all<{ id: string; wait_for: string | null }>();
  for (const row of results) {
    if (row.wait_for) await db.prepare("UPDATE automation_enrollments SET next_run_at=NULL, wait_for=NULL, context=json_patch(context, ?) WHERE id=?").bind(JSON.stringify({ __waitOutcome: "else" }), row.id).run();
    else await db.prepare("UPDATE automation_enrollments SET next_run_at=NULL WHERE id=?").bind(row.id).run();
    await runEnrollment(row.id);
  }
  return { resumed: results.length };
}

type State = { tenantId: string; workflowId: string; enrollmentId: string; ctx: Ctx; vars: Record<string, string>; contact: Record<string, unknown> | null; contactId: string | null; settings: CompanySettings };

function evaluate(step: Step, s: State): boolean {
  const c = s.contact || {};
  const field = str(step.field); const op = str(step.op || "equals"); const want = str(step.value).toLowerCase();
  const raw = field.startsWith("ctx.") ? s.ctx[field.slice(4)] : field === "tags" ? parseJson<string[]>(c.tags, []).join(",") : field === "lead_score" ? c.lead_score ?? 0 : c[field] ?? s.ctx[field];
  const have = str(raw).toLowerCase();
  switch (op) {
    case "equals": return have === want;
    case "not_equals": return have !== want;
    case "contains": return have.includes(want);
    case "not_contains": return !have.includes(want);
    case "empty": return !have;
    case "not_empty": return Boolean(have);
    case "gt": return Number(have) > Number(want);
    case "lt": return Number(have) < Number(want);
    default: return false;
  }
}

const htmlOf = (text: string) => `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">${text.split("\n").map((l) => `<p style="margin:0 0 12px">${l.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[ch] || ch)}</p>`).join("")}</div>`;

async function execute(step: Step, s: State): Promise<string> {
  const db = coreDb(); const t = now();
  const needContact = () => { if (!s.contactId || !s.contact) throw new Error("no contact on this enrollment"); return s.contact; };
  const sendMail = async (to: string, subject: string, text: string) => {
    const status = await emailTransportStatus(s.tenantId);
    if (status.transport === "none") throw new Error("no email sender connected (Resend key or Google)");
    const ok = await sendEmail({ to, subject, html: htmlOf(text), tenantId: s.tenantId, replyTo: s.settings.replyTo || undefined });
    if (!ok) throw new Error("email send failed");
    await db.prepare("INSERT INTO crm_activities (id,contact_id,activity_type,title,details,status,created_by,tenant_id,created_at,updated_at) VALUES (?,?,'EMAIL',?,?,'COMPLETED','automation',?,?,?)").bind(uid(), s.contactId, subject, text, s.tenantId, t, t).run();
  };
  const sendText = async (to: string, text: string) => {
    const r = await sendSms(to, text);
    await db.prepare("INSERT INTO crm_activities (id,contact_id,activity_type,title,details,status,created_by,tenant_id,created_at,updated_at) VALUES (?,?,'SMS',?,?,'COMPLETED','automation',?,?,?)").bind(uid(), s.contactId, r.sent ? "Text sent" : "Text logged (SMS not connected)", text, s.tenantId, t, t).run();
    if (!r.sent && smsConfigured()) throw new Error(r.detail);
    return r.sent;
  };
  switch (step.type) {
    case "SEND_EMAIL": {
      const c = needContact(); const to = str(c.email); if (!to) throw new Error("contact has no email");
      const subject = render(str(step.subject || "Message from {{company.name}}"), s.vars); const text = render(str(step.body || ""), s.vars);
      await sendMail(to, subject, text);
      return `Email sent to ${to} · "${subject}"`;
    }
    case "SEND_SMS": {
      const c = needContact(); const to = str(c.phone); if (!to) throw new Error("contact has no phone");
      const text = render(str(step.body || ""), s.vars);
      const sent = await sendText(to, text);
      return sent ? `Text sent to ${to}` : `Text logged only · SMS provider not connected`;
    }
    case "SEND_BOOKING_LINK": {
      const c = needContact();
      const slug = str(step.eventSlug);
      const link = `${appOrigin()}/?${slug ? `event=${encodeURIComponent(slug)}&` : ""}name=${encodeURIComponent(str(c.full_name))}&email=${encodeURIComponent(str(c.email))}#book`;
      const vars = { ...s.vars, "booking.link": link };
      const via = str(step.via || "email");
      if (via === "sms") { const to = str(c.phone); if (!to) throw new Error("contact has no phone"); const sent = await sendText(to, render(str(step.body || "Hi {{contact.first_name}}, grab a time with {{company.name}} here: {{booking.link}}"), vars)); return sent ? `Booking link texted to ${to}` : "Booking link logged (SMS not connected)"; }
      const to = str(c.email); if (!to) throw new Error("contact has no email");
      await sendMail(to, render(str(step.subject || "Pick a time with {{company.name}}"), vars), render(str(step.body || "Hi {{contact.first_name}},\n\nPick whatever time works best: {{booking.link}}\n\n{{company.name}}"), vars));
      return `Booking link emailed to ${to}`;
    }
    case "IF": return evaluate(step, s) ? `Condition met: ${str(step.field)} ${str(step.op || "equals")} ${str(step.value)}` : "__STOP__";
    case "ADD_TAG": case "REMOVE_TAG": {
      const c = needContact(); const tag = str(step.tag).trim().toLowerCase(); if (!tag) throw new Error("no tag");
      const tags = new Set(parseJson<string[]>(c.tags, []));
      if (step.type === "ADD_TAG") tags.add(tag); else tags.delete(tag);
      await db.prepare("UPDATE crm_contacts SET tags=?, updated_at=? WHERE id=?").bind(JSON.stringify([...tags]), t, s.contactId).run();
      s.contact = { ...c, tags: JSON.stringify([...tags]) };
      if (step.type === "ADD_TAG") await emitAutomationEvent(s.tenantId, "TAG_ADDED", { contactId: s.contactId, tag, trigger: "TAG_ADDED" });
      return `${step.type === "ADD_TAG" ? "Added" : "Removed"} tag "${tag}"`;
    }
    case "UPDATE_FIELD": {
      const c = needContact(); const field = str(step.field); const value = render(str(step.value), s.vars);
      const columns: Record<string, string> = { full_name: "full_name", email: "email", phone: "phone", title: "title", source: "source", lifecycle: "lifecycle", notes: "notes", assigned_rep: "assigned_rep" };
      if (columns[field]) {
        if (field === "full_name" && !value) throw new Error("name cannot be empty");
        await db.prepare(`UPDATE crm_contacts SET ${columns[field]}=?, updated_at=? WHERE id=?`).bind(field === "lifecycle" ? value.toUpperCase() : value || null, t, s.contactId).run();
        s.contact = { ...c, [columns[field]]: value };
        return `Set ${field} to "${value}"`;
      }
      if (field.startsWith("custom:")) {
        const name = field.slice(7);
        const def = await db.prepare("SELECT id FROM custom_fields WHERE tenant_id=? AND resource_type='contact' AND field_name=? AND active=1").bind(s.tenantId, name).first<{ id: string }>();
        if (!def) throw new Error(`custom field "${name}" does not exist`);
        await db.prepare("INSERT INTO custom_field_values (id,tenant_id,resource_type,resource_id,field_id,value,created_at,updated_at) VALUES (?,?,'contact',?,?,?,?,?) ON CONFLICT(tenant_id,resource_type,resource_id,field_id) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(uid(), s.tenantId, s.contactId, def.id, value, t, t).run();
        return `Set custom field ${name} to "${value}"`;
      }
      throw new Error(`unknown field ${field}`);
    }
    case "LEAD_SCORE": {
      const c = needContact(); const delta = Number(step.delta ?? 10);
      const score = Math.max(0, Number(c.lead_score || 0) + delta);
      await db.prepare("UPDATE crm_contacts SET lead_score=?, updated_at=? WHERE id=?").bind(score, t, s.contactId).run();
      s.contact = { ...c, lead_score: score }; s.vars["contact.score"] = String(score);
      return `Lead score ${delta >= 0 ? "+" : ""}${delta} → ${score}`;
    }
    case "CREATE_TASK": {
      const title = render(str(step.title || "Follow up with {{contact.name}}"), s.vars);
      const assignee = str(step.assignee) || s.vars.rep || null;
      const due = new Date(Date.now() + Math.max(0, Number(step.dueInDays ?? 1)) * 86_400_000).toISOString();
      await db.prepare(`INSERT INTO work_tasks (id,title,details,status,priority,assignee,reporter,contact_id,due_at,estimated_minutes,tenant_id,created_at,updated_at) VALUES (?,?,?,'TODO',?,?,'automation',?,?,30,?,?,?)`)
        .bind(uid(), title, render(str(step.details || "Created by automation"), s.vars), str(step.priority || "MEDIUM").toUpperCase(), assignee, s.contactId, due, s.tenantId, t, t).run();
      return `Task "${title}" for ${assignee || "unassigned"}`;
    }
    case "ADD_NOTE": {
      needContact(); const text = render(str(step.text || ""), s.vars);
      await db.prepare("INSERT INTO crm_activities (id,contact_id,activity_type,title,details,status,created_by,tenant_id,created_at,updated_at) VALUES (?,?,'NOTE',?,?,'COMPLETED','automation',?,?,?)").bind(uid(), s.contactId, text.slice(0, 80), text, s.tenantId, t, t).run();
      return `Note added`;
    }
    case "CREATE_DEAL": {
      const c = needContact();
      const pipeline = await db.prepare("SELECT id FROM crm_pipelines WHERE tenant_id=? AND active=1 ORDER BY is_default DESC, created_at LIMIT 1").bind(s.tenantId).first<{ id: string }>();
      const firstStage = pipeline ? await db.prepare("SELECT name FROM crm_pipeline_stages WHERE pipeline_id=? ORDER BY position LIMIT 1").bind(pipeline.id).first<{ name: string }>() : null;
      let accountId = str(c.account_id);
      if (!accountId) {
        accountId = uid();
        await db.prepare("INSERT INTO crm_accounts (id,name,owner_email,source,status,tenant_id,created_at,updated_at) VALUES (?,?,?,?, 'ACTIVE',?,?,?)").bind(accountId, str(c.full_name), s.vars.rep || "automation", "AUTOMATION", s.tenantId, t, t).run();
        await db.prepare("UPDATE crm_contacts SET account_id=? WHERE id=?").bind(accountId, s.contactId).run();
      }
      const name = render(str(step.name || "{{contact.name}} — new deal"), s.vars);
      const stage = str(step.stage).toUpperCase() || firstStage?.name || "NEW LEAD";
      const cents = Math.round(Number(step.valueDollars || 0) * 100);
      await db.prepare("INSERT INTO crm_opportunities (id,account_id,primary_contact_id,pipeline_id,name,stage,value_cents,probability,assigned_rep,source,tenant_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,10,?,'AUTOMATION',?,?,?)")
        .bind(uid(), accountId, s.contactId, pipeline?.id || null, name, stage, cents, s.vars.rep || null, s.tenantId, t, t).run();
      return `Deal "${name}" created in ${stage}${cents ? ` · $${(cents / 100).toLocaleString()}` : ""}`;
    }
    case "ASSIGN_REP": {
      needContact(); const rep = str(step.rep).trim().toLowerCase(); if (!rep) throw new Error("no teammate");
      await db.batch([
        db.prepare("UPDATE crm_contacts SET assigned_rep=?, updated_at=? WHERE id=?").bind(rep, t, s.contactId),
        db.prepare("UPDATE crm_opportunities SET assigned_rep=?, updated_at=? WHERE primary_contact_id=? AND stage NOT LIKE 'CLOSED%'").bind(rep, t, s.contactId),
      ]);
      s.vars.rep = rep;
      return `Assigned to ${rep}`;
    }
    case "ROUND_ROBIN": {
      needContact();
      const reps = str(step.reps).split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
      if (!reps.length) throw new Error("no teammates listed");
      // Least-loaded wins: the rep with the fewest contacts assigned in this company.
      const { results } = await db.prepare(`SELECT lower(assigned_rep) AS rep, COUNT(*) AS n FROM crm_contacts WHERE tenant_id=? AND lower(assigned_rep) IN (${reps.map(() => "?").join(",")}) GROUP BY lower(assigned_rep)`).bind(s.tenantId, ...reps).all<{ rep: string; n: number }>();
      const load = new Map(results.map((r) => [r.rep, Number(r.n)]));
      const rep = [...reps].sort((a, b) => (load.get(a) || 0) - (load.get(b) || 0))[0];
      await db.batch([
        db.prepare("UPDATE crm_contacts SET assigned_rep=?, updated_at=? WHERE id=?").bind(rep, t, s.contactId),
        db.prepare("UPDATE crm_opportunities SET assigned_rep=?, updated_at=? WHERE primary_contact_id=? AND stage NOT LIKE 'CLOSED%'").bind(rep, t, s.contactId),
      ]);
      s.vars.rep = rep;
      return `Round-robin → ${rep} (${load.get(rep) || 0} contacts)`;
    }
    case "MOVE_STAGE": {
      needContact(); const stage = str(step.stage).toUpperCase(); if (!stage) throw new Error("no stage");
      const r = await db.prepare("UPDATE crm_opportunities SET stage=?, updated_at=? WHERE tenant_id=? AND primary_contact_id=? AND stage NOT LIKE 'CLOSED%'").bind(stage, t, s.tenantId, s.contactId).run();
      return `Moved ${r.meta?.changes ?? 0} open deal(s) to ${stage}`;
    }
    case "SET_LIFECYCLE": {
      needContact(); const lc = str(step.lifecycle).toUpperCase() || "LEAD";
      await db.prepare("UPDATE crm_contacts SET lifecycle=?, updated_at=? WHERE id=?").bind(lc, t, s.contactId).run();
      return `Lifecycle set to ${lc}`;
    }
    case "NOTIFY_TEAM": {
      const to = str(step.to).toLowerCase() || s.vars.rep; if (!to) throw new Error("no teammate to notify");
      const message = render(str(step.message || "{{contact.name}} needs attention"), s.vars);
      await db.prepare("INSERT INTO workspace_notifications (id,recipient,title,body,entity_type,entity_id,created_at) VALUES (?,?,?,?,'CONTACT',?,?)").bind(uid(), to, "Automation", message, s.contactId, t).run();
      const status = await emailTransportStatus(s.tenantId);
      const emailed = status.transport !== "none" ? await sendEmail({ to, subject: `Cyncro: ${message.slice(0, 80)}`, html: `<p>${message}</p>`, tenantId: s.tenantId }) : false;
      return `Notified ${to}${emailed ? " (in-app + email)" : " (in-app)"}`;
    }
    case "POST_TO_CHAT": {
      const name = (str(step.channel) || "automations").toLowerCase().replace(/^#/, "");
      const message = render(str(step.message || "{{contact.name}}: automation update"), s.vars);
      let channel = await db.prepare("SELECT id FROM team_chat_channels WHERE tenant_id=? AND lower(name)=? AND archived=0").bind(s.tenantId, name).first<{ id: string }>();
      if (!channel) {
        const id = uid();
        await db.prepare("INSERT INTO team_chat_channels (id,name,type,description,created_by,archived,tenant_id,created_at,updated_at) VALUES (?,?,'PUBLIC','Posts from automations','automation',0,?,?,?)").bind(id, name, s.tenantId, t, t).run();
        channel = { id };
      }
      await db.prepare("INSERT INTO team_chat_messages (id,channel_id,author_email,author_name,body,thread_parent_id,attachments_json,crm_link_type,crm_link_id,created_at,updated_at) VALUES (?,?,?,?,?,NULL,'[]',?,?,?,?)").bind(uid(), channel.id, "automation@cyncro", "Automation", message, s.contactId ? "CONTACT" : null, s.contactId, t, t).run();
      return `Posted to #${name}`;
    }
    case "ENROLL_WORKFLOW": {
      needContact(); const target = str(step.workflowId); if (!target || target === s.workflowId) throw new Error("pick another workflow");
      const wf = await db.prepare("SELECT id, name, active FROM automation_workflows WHERE id=? AND tenant_id=?").bind(target, s.tenantId).first<{ id: string; name: string; active: number }>();
      if (!wf) throw new Error("workflow not found"); if (!wf.active) throw new Error(`"${wf.name}" is paused`);
      const id = await enroll(s.tenantId, wf.id, { contactId: s.contactId, trigger: "MANUAL", from: s.workflowId });
      if (!id) return `Already in "${wf.name}"`;
      await runEnrollment(id);
      return `Started "${wf.name}"`;
    }
    case "REMOVE_FROM_WORKFLOW": {
      needContact(); const target = str(step.workflowId || "all");
      const r = target === "all"
        ? await db.prepare("UPDATE automation_enrollments SET status='STOPPED', next_run_at=NULL, wait_for=NULL, updated_at=? WHERE tenant_id=? AND contact_id=? AND status='ACTIVE' AND id<>?").bind(t, s.tenantId, s.contactId, s.enrollmentId).run()
        : await db.prepare("UPDATE automation_enrollments SET status='STOPPED', next_run_at=NULL, wait_for=NULL, updated_at=? WHERE tenant_id=? AND contact_id=? AND status='ACTIVE' AND workflow_id=? AND id<>?").bind(t, s.tenantId, s.contactId, target, s.enrollmentId).run();
      return `Stopped ${r.meta?.changes ?? 0} other workflow run(s)`;
    }
    case "WEBHOOK": {
      const url = str(step.url); if (!/^https?:\/\//.test(url)) throw new Error("invalid webhook url");
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: s.ctx.trigger, contact: s.contact, context: s.ctx, at: t }) });
      return `Webhook ${url} → ${r.status}`;
    }
    default:
      throw new Error(`unknown step ${String(step.type)}`);
  }
}

/**
 * Time-based triggers the cron discovers by scanning real rows. Each hit is
 * marked once per (workflow, thing) so a reminder never fires twice.
 */
export async function runAutomationScans(): Promise<{ upcoming: number; stale: number; overdue: number }> {
  const db = coreDb(); const out = { upcoming: 0, stale: 0, overdue: 0 };
  const { results: wfs } = await db.prepare("SELECT * FROM automation_workflows WHERE active=1 AND trigger IN ('BOOKING_UPCOMING','DEAL_STALE','INVOICE_OVERDUE')").all<Record<string, unknown>>();
  const fire = async (wf: Record<string, unknown>, key: string, ctx: Ctx) => {
    const ins = await db.prepare("INSERT OR IGNORE INTO automation_scan_marks (id,tenant_id,workflow_id,mark_key,created_at) VALUES (?,?,?,?,?)").bind(uid(), String(wf.tenant_id), String(wf.id), key, now()).run();
    if (!ins.meta?.changes) return false;
    const id = await enroll(String(wf.tenant_id), String(wf.id), ctx);
    if (id) await runEnrollment(id);
    return true;
  };
  for (const wf of wfs) {
    const filter = parseJson<Record<string, unknown>>(wf.trigger_filter, {}); const tenantId = String(wf.tenant_id);
    if (wf.trigger === "BOOKING_UPCOMING") {
      const hours = Math.max(0.25, Number(filter.hoursBefore || 24));
      const from = new Date(Date.now() + (hours - 0.5) * 3_600_000).toISOString(); const to = new Date(Date.now() + (hours + 0.5) * 3_600_000).toISOString();
      const { results } = await db.prepare("SELECT b.id, b.contact_id, b.customer_name, b.customer_email, b.customer_phone, b.starts_at, b.assigned_to, e.name AS event_name, e.slug FROM calendar_bookings b JOIN calendar_event_types e ON e.id=b.event_type_id WHERE b.tenant_id=? AND b.status IN ('CONFIRMED','RESCHEDULED') AND b.starts_at BETWEEN ? AND ? AND (? = '' OR e.slug = ?)").bind(tenantId, from, to, str(filter.eventSlug), str(filter.eventSlug)).all<Record<string, unknown>>();
      for (const b of results) {
        if (await fire(wf, `booking:${b.id}:${hours}`, { contactId: str(b.contact_id), bookingId: b.id, customerName: b.customer_name, customerEmail: b.customer_email, customerPhone: b.customer_phone, startsAt: b.starts_at, eventName: b.event_name, eventSlug: b.slug, assignedTo: b.assigned_to, hoursBefore: hours, trigger: "BOOKING_UPCOMING" })) out.upcoming++;
      }
    }
    if (wf.trigger === "DEAL_STALE") {
      const days = Math.max(1, Number(filter.days || 7)); const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      const { results } = await db.prepare("SELECT id, primary_contact_id, name, stage, value_cents, assigned_rep, updated_at FROM crm_opportunities WHERE tenant_id=? AND stage NOT LIKE 'CLOSED%' AND updated_at < ? AND (? = '' OR upper(stage) = upper(?)) AND primary_contact_id IS NOT NULL").bind(tenantId, cutoff, str(filter.stage), str(filter.stage)).all<Record<string, unknown>>();
      for (const d of results) {
        if (await fire(wf, `deal:${d.id}:${str(d.updated_at)}`, { contactId: d.primary_contact_id, dealId: d.id, dealName: d.name, stage: d.stage, valueCents: d.value_cents, assignedRep: d.assigned_rep, staleDays: days, trigger: "DEAL_STALE" })) out.stale++;
      }
    }
    if (wf.trigger === "INVOICE_OVERDUE") {
      const grace = Math.max(0, Number(filter.daysAfter || 1)); const cutoff = new Date(Date.now() - grace * 86_400_000).toISOString().slice(0, 10);
      const { results } = await db.prepare("SELECT i.id, i.invoice_number, i.client_name, i.client_email, i.amount_cents, i.due_date, c.id AS contact_id FROM crm_invoices i LEFT JOIN crm_contacts c ON c.tenant_id=i.tenant_id AND lower(c.email)=lower(i.client_email) WHERE i.tenant_id=? AND i.status='SENT' AND i.due_date IS NOT NULL AND i.due_date <= ?").bind(tenantId, cutoff).all<Record<string, unknown>>();
      for (const i of results) {
        if (await fire(wf, `invoice:${i.id}:${grace}`, { contactId: str(i.contact_id), invoiceId: i.id, invoiceNumber: i.invoice_number, customerName: i.client_name, customerEmail: i.client_email, amountCents: i.amount_cents, dueDate: i.due_date, trigger: "INVOICE_OVERDUE" })) out.overdue++;
      }
    }
  }
  return out;
}

/** One-click recipes, the way HighLevel ships starter workflows. */
export const RECIPES: { key: string; name: string; description: string; trigger: Trigger; filter?: Record<string, unknown>; exitTrigger?: Trigger; settings?: Partial<WorkflowSettings>; steps: Step[] }[] = [
  { key: "lead_nurture", name: "New lead nurture", description: "Instant email, text next day, task for the rep after 3 days of silence. Exits the moment they book.", trigger: "CONTACT_CREATED", exitTrigger: "BOOKING_CREATED", steps: [
    { type: "SEND_EMAIL", subject: "Thanks for reaching out, {{contact.first_name}}", body: "Hi {{contact.first_name}},\n\nThanks for getting in touch with {{company.name}}. I'll follow up shortly. If you'd rather pick a time, grab one here: {{booking.link}}\n\nTalk soon,\n{{company.name}}" },
    { type: "WAIT", amount: 1, unit: "days" },
    { type: "SEND_SMS", body: "Hi {{contact.first_name}}, it's {{company.name}}. Still want a hand with this? Reply YES and I'll call you." },
    { type: "WAIT", amount: 2, unit: "days" },
    { type: "CREATE_TASK", title: "Call {{contact.name}} — no reply after 3 days", dueInDays: 0, priority: "HIGH" },
  ] },
  { key: "fast_response", name: "Form submitted: 5-minute response", description: "Ping the team, thank the lead, score them, task due now.", trigger: "FORM_SUBMITTED", steps: [
    { type: "LEAD_SCORE", delta: 20 },
    { type: "NOTIFY_TEAM", message: "New form from {{contact.name}} ({{contact.phone}}) — call within 5 minutes" },
    { type: "POST_TO_CHAT", channel: "leads", message: "New lead: {{contact.name}} · {{contact.email}} · {{contact.phone}}" },
    { type: "SEND_EMAIL", subject: "Got it, {{contact.first_name}}", body: "Thanks {{contact.first_name}}, we received your request and someone from {{company.name}} will reach out within the hour." },
    { type: "CREATE_TASK", title: "Call {{contact.name}} back (form)", dueInDays: 0, priority: "HIGH" },
  ] },
  { key: "book_or_chase", name: "Book or chase", description: "Send the booking link, wait 2 days for a booking; if none, text and task the rep.", trigger: "CONTACT_CREATED", steps: [
    { type: "SEND_BOOKING_LINK", via: "email", subject: "Pick a time with {{company.name}}", body: "Hi {{contact.first_name}},\n\nPick whatever time works best: {{booking.link}}\n\n{{company.name}}" },
    { type: "WAIT_FOR", event: "BOOKING_CREATED", amount: 2, unit: "days",
      then: [{ type: "ADD_TAG", tag: "booked" }],
      else: [{ type: "SEND_SMS", body: "Hi {{contact.first_name}}, {{company.name}} here — still want to grab a time? {{booking.link}}" }, { type: "CREATE_TASK", title: "Chase {{contact.name}} — no booking after 2 days", dueInDays: 0 }] },
  ] },
  { key: "reminder_24h", name: "Appointment reminder: 24 hours", description: "Email and text the day before, with the time in your timezone.", trigger: "BOOKING_UPCOMING", filter: { hoursBefore: 24 }, steps: [
    { type: "SEND_EMAIL", subject: "See you tomorrow — {{booking.event}}", body: "Hi {{contact.first_name}},\n\nA reminder that your {{booking.event}} with {{company.name}} is {{booking.time}}. Reply to this email if you need to change it.\n\n{{company.name}}" },
    { type: "SEND_SMS", body: "Reminder from {{company.name}}: {{booking.event}} {{booking.time}}. Reply if you need to reschedule." },
  ] },
  { key: "reminder_1h", name: "Appointment reminder: 1 hour", description: "A text an hour before.", trigger: "BOOKING_UPCOMING", filter: { hoursBefore: 1 }, steps: [
    { type: "SEND_SMS", body: "{{company.name}}: your {{booking.event}} starts in about an hour ({{booking.time}}). See you soon!" },
  ] },
  { key: "no_show", name: "No-show recovery", description: "Text an hour after a missed appointment, email with a rebook link, task the host.", trigger: "BOOKING_NO_SHOW", exitTrigger: "BOOKING_CREATED", steps: [
    { type: "WAIT", amount: 1, unit: "hours" },
    { type: "SEND_SMS", body: "Hi {{contact.first_name}}, sorry we missed you today. Want to grab a new time? {{booking.link}}" },
    { type: "WAIT", amount: 1, unit: "days" },
    { type: "SEND_BOOKING_LINK", via: "email", subject: "Let's find a better time", body: "Hi {{contact.first_name}},\n\nWe missed you for {{booking.event}}. No problem at all — pick a new time here: {{booking.link}}\n\n{{company.name}}" },
    { type: "CREATE_TASK", title: "Rebook {{contact.name}} (no-show)", dueInDays: 1 },
  ] },
  { key: "text_back", name: "Missed text auto-reply", description: "When a customer texts in, notify the rep and auto-reply outside business hours only.", trigger: "INBOUND_SMS", steps: [
    { type: "NOTIFY_TEAM", message: "{{contact.name}} texted: {{sms.body}}" },
    { type: "IF_ELSE", field: "ctx.withinBusinessHours", op: "equals", value: "true",
      then: [{ type: "ADD_NOTE", text: "Inbound text during business hours — rep notified" }],
      else: [{ type: "SEND_SMS", body: "Thanks for texting {{company.name}}! We're closed right now but will reply first thing when we open." }] },
  ] },
  { key: "hot_lead_round_robin", name: "Hot lead round-robin", description: "When a contact is tagged hot, assign the least-loaded rep and task them.", trigger: "TAG_ADDED", filter: { tag: "hot" }, steps: [
    { type: "ROUND_ROBIN", reps: "" },
    { type: "CREATE_TASK", title: "Hot lead: call {{contact.name}} now", dueInDays: 0, priority: "URGENT" },
    { type: "NOTIFY_TEAM", message: "Hot lead {{contact.name}} assigned to you" },
  ] },
  { key: "won_onboarding", name: "Deal won: welcome + handoff", description: "Welcome email, tag as customer, notify the team.", trigger: "DEAL_WON", steps: [
    { type: "SEND_EMAIL", subject: "Welcome aboard, {{contact.first_name}}!", body: "Hi {{contact.first_name}},\n\nWelcome to {{company.name}}. Here's what happens next: your point of contact is {{rep}} and they'll reach out within one business day.\n\nThank you for trusting us." },
    { type: "ADD_TAG", tag: "customer" },
    { type: "SET_LIFECYCLE", lifecycle: "CUSTOMER" },
    { type: "POST_TO_CHAT", channel: "wins", message: "Deal won: {{contact.name}} · {{deal.name}} {{deal.value}}" },
  ] },
  { key: "stale_deal", name: "Stale deal chase", description: "A deal untouched for 7 days gets an email and a task for the rep.", trigger: "DEAL_STALE", filter: { days: 7 }, steps: [
    { type: "SEND_EMAIL", subject: "Any questions on {{deal.name}}?", body: "Hi {{contact.first_name}},\n\nJust checking in on {{deal.name}}. Happy to walk through it or adjust anything.\n\n{{rep}}" },
    { type: "CREATE_TASK", title: "Chase {{contact.name}} — {{deal.name}} stale", dueInDays: 0 },
  ] },
  { key: "review_request", name: "Job done: review request", description: "Two hours after a job completes, ask for a review by email, then text a day later.", trigger: "JOB_COMPLETED", steps: [
    { type: "WAIT", amount: 2, unit: "hours" },
    { type: "SEND_EMAIL", subject: "How did we do, {{contact.first_name}}?", body: "Hi {{contact.first_name}},\n\nThanks for having {{company.name}} out for your {{job.service}}. If everything went well, a quick review helps us a lot. If anything was off, reply here and we'll make it right." },
    { type: "WAIT", amount: 1, unit: "days" },
    { type: "SEND_SMS", body: "Thanks again from {{company.name}}! Mind leaving us a quick review? It means a lot." },
  ] },
  { key: "invoice_thanks", name: "Invoice paid: thank you", description: "Thank-you email and a customer tag when money lands.", trigger: "INVOICE_PAID", steps: [
    { type: "SEND_EMAIL", subject: "Payment received — thank you", body: "Hi {{contact.first_name}},\n\nWe've received your payment. Thank you for your business!\n\n{{company.name}}" },
    { type: "ADD_TAG", tag: "paid" },
  ] },
  { key: "invoice_overdue", name: "Overdue invoice chase", description: "A day after the due date, a friendly reminder; three days later, a firmer one and a task.", trigger: "INVOICE_OVERDUE", filter: { daysAfter: 1 }, exitTrigger: "INVOICE_PAID", steps: [
    { type: "SEND_EMAIL", subject: "Invoice {{invoice.number}} is past due", body: "Hi {{contact.first_name}},\n\nA quick reminder that invoice {{invoice.number}} for {{invoice.amount}} was due. If it's already on its way, thank you — otherwise you can pay from the original invoice email.\n\n{{company.name}}" },
    { type: "WAIT", amount: 3, unit: "days" },
    { type: "SEND_EMAIL", subject: "Second notice: invoice {{invoice.number}}", body: "Hi {{contact.first_name}},\n\nInvoice {{invoice.number}} ({{invoice.amount}}) is still open. Please settle it this week or reply so we can sort out a plan.\n\n{{company.name}}" },
    { type: "CREATE_TASK", title: "Call {{contact.name}} about overdue {{invoice.number}}", dueInDays: 0, priority: "HIGH" },
  ] },
  { key: "reactivation", name: "Database reactivation", description: "Bulk-enroll old leads: an offer email at 9am, a text two days later, tag the ones who book.", trigger: "MANUAL", exitTrigger: "BOOKING_CREATED", settings: { reenroll: "once" }, steps: [
    { type: "WAIT_UNTIL", time: "09:00", days: [1, 2, 3, 4, 5] },
    { type: "SEND_EMAIL", subject: "Still thinking about it, {{contact.first_name}}?", body: "Hi {{contact.first_name}},\n\nIt's been a while since we spoke. If it's still on your list, we'd love to help — grab a time here: {{booking.link}}\n\n{{company.name}}" },
    { type: "WAIT", amount: 2, unit: "days" },
    { type: "SPLIT_TEST", percentA: 50,
      then: [{ type: "SEND_SMS", body: "Hi {{contact.first_name}}, {{company.name}} here. Want to pick this back up? {{booking.link}}" }],
      else: [{ type: "SEND_SMS", body: "{{contact.first_name}}, quick one from {{company.name}}: we have openings this week. {{booking.link}}" }] },
  ] },
];
