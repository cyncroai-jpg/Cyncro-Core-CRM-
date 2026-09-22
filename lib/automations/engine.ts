/**
 * Cyncro automation engine — HighLevel-style workflows.
 *
 * A workflow = one trigger + an optional filter + an ordered list of steps.
 * When a real event happens (contact created, booking made, deal won, form
 * submitted, job completed, tag added …) every active workflow on that trigger
 * enrolls the contact and runs steps until it hits a WAIT. A cron picks the
 * enrollment back up when the wait is over. Every step writes a log row, so
 * the Automations tab shows exactly what happened, not a claimed run count.
 */
import { coreDb } from "@/lib/core/db";
import { emailTransportStatus, sendEmail } from "@/lib/core/email";
import { sendSms, smsConfigured } from "@/lib/automations/sms";

export const TRIGGERS = [
  ["CONTACT_CREATED", "New contact or lead created"],
  ["FORM_SUBMITTED", "Form submitted"],
  ["BOOKING_CREATED", "Appointment booked"],
  ["BOOKING_CANCELLED", "Appointment cancelled"],
  ["BOOKING_NO_SHOW", "Appointment no-show"],
  ["BOOKING_COMPLETED", "Appointment completed"],
  ["DEAL_STAGE_CHANGED", "Deal moved to a stage"],
  ["DEAL_WON", "Deal won"],
  ["DEAL_LOST", "Deal lost"],
  ["TAG_ADDED", "Tag added to contact"],
  ["JOB_COMPLETED", "Dispatch job completed"],
  ["INVOICE_PAID", "Invoice paid"],
  ["MANUAL", "Added by a teammate"],
] as const;
export type Trigger = (typeof TRIGGERS)[number][0];

export const STEP_TYPES = [
  ["SEND_EMAIL", "Send email"], ["SEND_SMS", "Send text"], ["WAIT", "Wait"], ["IF", "Continue only if"],
  ["ADD_TAG", "Add tag"], ["REMOVE_TAG", "Remove tag"], ["CREATE_TASK", "Create task"], ["ADD_NOTE", "Add note"],
  ["ASSIGN_REP", "Assign to teammate"], ["MOVE_STAGE", "Move deal to stage"], ["SET_LIFECYCLE", "Set lifecycle"],
  ["NOTIFY_TEAM", "Notify teammate"], ["WEBHOOK", "Send webhook"], ["END", "End workflow"],
] as const;
export type StepType = (typeof STEP_TYPES)[number][0];
export type Step = { type: StepType; [key: string]: unknown };

type Ctx = Record<string, unknown>;
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

function parseJson<T>(raw: unknown, fallback: T): T { try { return raw ? (JSON.parse(String(raw)) as T) : fallback; } catch { return fallback; } }

/** Simple equality filter: every non-empty key in the filter must equal the context value. */
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
  const fullName = str(contact?.full_name || ctx.customerName || ctx.name || "there");
  vars["contact.name"] = fullName;
  vars["contact.first_name"] = fullName.split(" ")[0] || "there";
  vars["contact.email"] = str(contact?.email || ctx.customerEmail || "");
  vars["contact.phone"] = str(contact?.phone || ctx.customerPhone || "");
  vars["contact.company"] = str(contact?.company_name || "");
  vars["company.name"] = str(tenant?.name || "our team");
  vars["rep"] = str(contact?.assigned_rep || ctx.assignedTo || ctx.assignedRep || "");
  vars["booking.time"] = ctx.startsAt ? new Date(str(ctx.startsAt)).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  vars["booking.event"] = str(ctx.eventName || "");
  vars["deal.name"] = str(ctx.dealName || "");
  vars["deal.stage"] = str(ctx.stage || "");
  vars["job.service"] = str(ctx.serviceType || "");
  vars["tag"] = str(ctx.tag || "");
  return { vars, contact };
}
export function render(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*([a-z_.]+)\s*\}\}/gi, (_, key: string) => vars[key] ?? "");
}

/** Fire an event. Enrolls the contact in every active workflow on this trigger and runs until the first wait. */
export async function emitAutomationEvent(tenantId: string, trigger: Trigger, ctx: Ctx): Promise<number> {
  try {
    const db = coreDb();
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

/** Create an enrollment unless the same contact is already active in this workflow. */
export async function enroll(tenantId: string, workflowId: string, ctx: Ctx): Promise<string | null> {
  const db = coreDb();
  const contactId = str(ctx.contactId) || null;
  if (contactId) {
    const dup = await db.prepare("SELECT id FROM automation_enrollments WHERE workflow_id=? AND contact_id=? AND status='ACTIVE'").bind(workflowId, contactId).first();
    if (dup) return null;
  }
  const id = uid(); const t = now();
  await db.batch([
    db.prepare("INSERT INTO automation_enrollments (id,tenant_id,workflow_id,contact_id,context,step_index,status,next_run_at,started_at,updated_at) VALUES (?,?,?,?,?,0,'ACTIVE',?,?,?)").bind(id, tenantId, workflowId, contactId, JSON.stringify(ctx), t, t, t),
    db.prepare("UPDATE automation_workflows SET enrolled_count=enrolled_count+1, last_run_at=?, updated_at=? WHERE id=?").bind(t, t, workflowId),
    db.prepare("INSERT INTO automation_events (id,tenant_id,workflow_id,enrollment_id,contact_id,step_index,kind,detail,created_at) VALUES (?,?,?,?,?,NULL,'ENROLLED',?,?)").bind(uid(), tenantId, workflowId, id, contactId, `Trigger ${str(ctx.trigger || "")}`.trim(), t),
  ]);
  return id;
}

async function log(tenantId: string, workflowId: string, enrollmentId: string, contactId: string | null, stepIndex: number | null, kind: string, detail: string) {
  await coreDb().prepare("INSERT INTO automation_events (id,tenant_id,workflow_id,enrollment_id,contact_id,step_index,kind,detail,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(uid(), tenantId, workflowId, enrollmentId, contactId, stepIndex, kind, detail.slice(0, 500), now()).run();
}

/** Run steps from the enrollment's current index until a WAIT, END, failure or the last step. */
export async function runEnrollment(enrollmentId: string): Promise<void> {
  const db = coreDb();
  const en = await db.prepare("SELECT * FROM automation_enrollments WHERE id=? AND status='ACTIVE'").bind(enrollmentId).first<Record<string, unknown>>();
  if (!en) return;
  const wf = await db.prepare("SELECT * FROM automation_workflows WHERE id=?").bind(String(en.workflow_id)).first<Record<string, unknown>>();
  if (!wf || !Number(wf.active)) { await db.prepare("UPDATE automation_enrollments SET status='STOPPED', updated_at=? WHERE id=?").bind(now(), enrollmentId).run(); return; }
  const tenantId = String(en.tenant_id); const workflowId = String(wf.id); const contactId = en.contact_id ? String(en.contact_id) : null;
  const steps = parseJson<Step[]>(wf.steps, []);
  const ctx = parseJson<Ctx>(en.context, {});
  let i = Number(en.step_index || 0);
  const finish = async (status: "DONE" | "STOPPED" | "FAILED", detail: string) => {
    await db.batch([
      db.prepare("UPDATE automation_enrollments SET status=?, next_run_at=NULL, last_error=?, updated_at=? WHERE id=?").bind(status, status === "FAILED" ? detail : null, now(), enrollmentId),
      ...(status === "DONE" ? [db.prepare("UPDATE automation_workflows SET completed_count=completed_count+1, updated_at=? WHERE id=?").bind(now(), workflowId)] : []),
    ]);
    await log(tenantId, workflowId, enrollmentId, contactId, i, status, detail);
  };
  const { vars, contact } = await buildVars(tenantId, ctx);
  while (i < steps.length) {
    const step = steps[i] || { type: "END" };
    try {
      if (step.type === "WAIT") {
        const amount = Math.max(0, Number(step.amount || 0)); const unit = str(step.unit || "hours");
        const ms = amount * (unit === "minutes" ? 60_000 : unit === "days" ? 86_400_000 : 3_600_000);
        const next = new Date(Date.now() + ms).toISOString();
        await db.prepare("UPDATE automation_enrollments SET step_index=?, next_run_at=?, updated_at=? WHERE id=?").bind(i + 1, next, now(), enrollmentId).run();
        await log(tenantId, workflowId, enrollmentId, contactId, i, "WAIT", `Waiting ${amount} ${unit} · resumes ${next}`);
        return;
      }
      if (step.type === "END") { await finish("DONE", "Reached End"); return; }
      const detail = await execute(step, { tenantId, ctx, vars, contact, contactId });
      if (detail === "__STOP__") { await finish("STOPPED", `Condition not met at step ${i + 1}`); return; }
      await log(tenantId, workflowId, enrollmentId, contactId, i, step.type, detail);
      i++;
      await db.prepare("UPDATE automation_enrollments SET step_index=?, updated_at=? WHERE id=?").bind(i, now(), enrollmentId).run();
    } catch (error) {
      await finish("FAILED", `${step.type}: ${error instanceof Error ? error.message : "failed"}`);
      return;
    }
  }
  await finish("DONE", "All steps completed");
}

/** Cron entry: resume every enrollment whose wait is over. */
export async function processDueEnrollments(limit = 200): Promise<{ resumed: number }> {
  const db = coreDb();
  const { results } = await db.prepare("SELECT id FROM automation_enrollments WHERE status='ACTIVE' AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at LIMIT ?").bind(now(), limit).all<{ id: string }>();
  for (const row of results) { await db.prepare("UPDATE automation_enrollments SET next_run_at=NULL WHERE id=?").bind(row.id).run(); await runEnrollment(row.id); }
  return { resumed: results.length };
}

async function execute(step: Step, s: { tenantId: string; ctx: Ctx; vars: Record<string, string>; contact: Record<string, unknown> | null; contactId: string | null }): Promise<string> {
  const db = coreDb(); const t = now();
  const needContact = () => { if (!s.contactId || !s.contact) throw new Error("no contact on this enrollment"); return s.contact; };
  switch (step.type) {
    case "SEND_EMAIL": {
      const c = needContact(); const to = str(c.email);
      if (!to) throw new Error("contact has no email");
      const status = await emailTransportStatus(s.tenantId);
      if (status.transport === "none") throw new Error("no email sender connected (Resend key or Google)");
      const subject = render(str(step.subject || "Message from {{company.name}}"), s.vars);
      const text = render(str(step.body || ""), s.vars);
      const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">${text.split("\n").map((l) => `<p style="margin:0 0 12px">${l.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[ch] || ch)}</p>`).join("")}</div>`;
      const ok = await sendEmail({ to, subject, html, tenantId: s.tenantId });
      if (!ok) throw new Error("email send failed");
      await db.prepare("INSERT INTO crm_activities (id,contact_id,activity_type,title,details,status,created_by,tenant_id,created_at,updated_at) VALUES (?,?,'EMAIL',?,?,'COMPLETED','automation',?,?,?)").bind(uid(), s.contactId, subject, text, s.tenantId, t, t).run();
      return `Email sent to ${to} · "${subject}"`;
    }
    case "SEND_SMS": {
      const c = needContact(); const to = str(c.phone);
      if (!to) throw new Error("contact has no phone");
      const text = render(str(step.body || ""), s.vars);
      const r = await sendSms(to, text);
      await db.prepare("INSERT INTO crm_activities (id,contact_id,activity_type,title,details,status,created_by,tenant_id,created_at,updated_at) VALUES (?,?,'SMS',?,?,'COMPLETED','automation',?,?,?)").bind(uid(), s.contactId, r.sent ? "Text sent" : "Text queued (no SMS provider)", text, s.tenantId, t, t).run();
      if (!r.sent && smsConfigured()) throw new Error(r.detail);
      return r.sent ? `Text sent to ${to}` : `Text logged only · ${r.detail}`;
    }
    case "IF": {
      const c = s.contact || {};
      const field = str(step.field); const op = str(step.op || "equals"); const want = str(step.value).toLowerCase();
      const have = str(field.startsWith("ctx.") ? s.ctx[field.slice(4)] : field === "tags" ? parseJson<string[]>(c.tags, []).join(",") : c[field] ?? s.ctx[field]).toLowerCase();
      const ok = op === "equals" ? have === want : op === "not_equals" ? have !== want : op === "contains" ? have.includes(want) : op === "empty" ? !have : op === "not_empty" ? Boolean(have) : false;
      return ok ? `Condition met: ${field} ${op} ${want}` : "__STOP__";
    }
    case "ADD_TAG": case "REMOVE_TAG": {
      const c = needContact(); const tag = str(step.tag).trim(); if (!tag) throw new Error("no tag");
      const tags = new Set(parseJson<string[]>(c.tags, []));
      if (step.type === "ADD_TAG") tags.add(tag); else tags.delete(tag);
      await db.prepare("UPDATE crm_contacts SET tags=?, updated_at=? WHERE id=?").bind(JSON.stringify([...tags]), t, s.contactId).run();
      s.contact = { ...c, tags: JSON.stringify([...tags]) };
      if (step.type === "ADD_TAG") await emitAutomationEvent(s.tenantId, "TAG_ADDED", { contactId: s.contactId, tag, trigger: "TAG_ADDED" });
      return `${step.type === "ADD_TAG" ? "Added" : "Removed"} tag "${tag}"`;
    }
    case "CREATE_TASK": {
      const title = render(str(step.title || "Follow up with {{contact.name}}"), s.vars);
      const assignee = str(step.assignee) || s.vars.rep || null;
      const due = new Date(Date.now() + Math.max(0, Number(step.dueInDays ?? 1)) * 86_400_000).toISOString();
      await db.prepare(`INSERT INTO work_tasks (id,title,details,status,priority,assignee,reporter,contact_id,due_at,estimated_minutes,created_at,updated_at) VALUES (?,?,?,'TODO',?,?,'automation',?,?,30,?,?)`)
        .bind(uid(), title, render(str(step.details || "Created by automation"), s.vars), str(step.priority || "MEDIUM").toUpperCase(), assignee, s.contactId, due, t, t).run();
      return `Task "${title}" for ${assignee || "unassigned"}`;
    }
    case "ADD_NOTE": {
      needContact(); const text = render(str(step.text || ""), s.vars);
      await db.prepare("INSERT INTO crm_activities (id,contact_id,activity_type,title,details,status,created_by,tenant_id,created_at,updated_at) VALUES (?,?,'NOTE',?,?,'COMPLETED','automation',?,?,?)").bind(uid(), s.contactId, text.slice(0, 80), text, s.tenantId, t, t).run();
      return `Note added`;
    }
    case "ASSIGN_REP": {
      needContact(); const rep = str(step.rep).trim(); if (!rep) throw new Error("no teammate");
      await db.batch([
        db.prepare("UPDATE crm_contacts SET assigned_rep=?, updated_at=? WHERE id=?").bind(rep, t, s.contactId),
        db.prepare("UPDATE crm_opportunities SET assigned_rep=?, updated_at=? WHERE primary_contact_id=? AND stage NOT LIKE 'CLOSED%'").bind(rep, t, s.contactId),
      ]);
      s.vars.rep = rep;
      return `Assigned to ${rep}`;
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
      const to = str(step.to) || s.vars.rep; if (!to) throw new Error("no teammate to notify");
      const message = render(str(step.message || "{{contact.name}} needs attention"), s.vars);
      await db.prepare("INSERT INTO workspace_notifications (id,recipient,title,body,entity_type,entity_id,created_at) VALUES (?,?,?,?,'CONTACT',?,?)").bind(uid(), to, "Automation", message, s.contactId, t).run();
      const status = await emailTransportStatus(s.tenantId);
      const emailed = status.transport !== "none" ? await sendEmail({ to, subject: `Cyncro: ${message.slice(0, 80)}`, html: `<p>${message}</p>`, tenantId: s.tenantId }) : false;
      return `Notified ${to}${emailed ? " (in-app + email)" : " (in-app)"}`;
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

/** One-click recipes, the way HighLevel ships starter workflows. */
export const RECIPES: { key: string; name: string; description: string; trigger: Trigger; steps: Step[] }[] = [
  { key: "lead_nurture", name: "New lead nurture", description: "Instant email, text next day, task for the rep after 3 days of silence.", trigger: "CONTACT_CREATED", steps: [
    { type: "SEND_EMAIL", subject: "Thanks for reaching out, {{contact.first_name}}", body: "Hi {{contact.first_name}},\n\nThanks for getting in touch with {{company.name}}. I'll follow up shortly. If you'd rather pick a time, reply to this email.\n\n{{rep}}" },
    { type: "WAIT", amount: 1, unit: "days" },
    { type: "SEND_SMS", body: "Hi {{contact.first_name}}, it's {{company.name}}. Still want a hand with this? Reply YES and I'll call you." },
    { type: "WAIT", amount: 2, unit: "days" },
    { type: "CREATE_TASK", title: "Call {{contact.name}} — no reply after 3 days", dueInDays: 0, priority: "HIGH" },
  ] },
  { key: "fast_response", name: "Form submitted: 5-minute response", description: "Ping the team, thank the lead, task due in 15 minutes.", trigger: "FORM_SUBMITTED", steps: [
    { type: "NOTIFY_TEAM", message: "New form from {{contact.name}} ({{contact.phone}}) — call within 5 minutes" },
    { type: "SEND_EMAIL", subject: "Got it, {{contact.first_name}}", body: "Thanks {{contact.first_name}}, we received your request and someone from {{company.name}} will reach out within the hour." },
    { type: "CREATE_TASK", title: "Call {{contact.name}} back (form)", dueInDays: 0, priority: "HIGH" },
  ] },
  { key: "no_show", name: "No-show recovery", description: "Text an hour after a missed appointment, email with a rebook nudge, task the host.", trigger: "BOOKING_NO_SHOW", steps: [
    { type: "WAIT", amount: 1, unit: "hours" },
    { type: "SEND_SMS", body: "Hi {{contact.first_name}}, sorry we missed you today. Want to grab a new time? Reply here and we'll set it up." },
    { type: "WAIT", amount: 1, unit: "days" },
    { type: "SEND_EMAIL", subject: "Let's find a better time", body: "Hi {{contact.first_name}},\n\nWe missed you for {{booking.event}}. No problem at all — reply with a day that works and we'll get you back on the calendar.\n\n{{company.name}}" },
    { type: "CREATE_TASK", title: "Rebook {{contact.name}} (no-show)", dueInDays: 1 },
  ] },
  { key: "won_onboarding", name: "Deal won: welcome + handoff", description: "Welcome email, tag as customer, notify the team.", trigger: "DEAL_WON", steps: [
    { type: "SEND_EMAIL", subject: "Welcome aboard, {{contact.first_name}}!", body: "Hi {{contact.first_name}},\n\nWelcome to {{company.name}}. Here's what happens next: your point of contact is {{rep}} and they'll reach out within one business day.\n\nThank you for choosing us." },
    { type: "ADD_TAG", tag: "customer" },
    { type: "SET_LIFECYCLE", lifecycle: "CUSTOMER" },
    { type: "NOTIFY_TEAM", message: "Deal won with {{contact.name}} — onboarding started" },
  ] },
  { key: "review_request", name: "Job done: review request", description: "Two hours after a job completes, ask for a Google review by email and text.", trigger: "JOB_COMPLETED", steps: [
    { type: "WAIT", amount: 2, unit: "hours" },
    { type: "SEND_EMAIL", subject: "How did we do, {{contact.first_name}}?", body: "Hi {{contact.first_name}},\n\nThanks for having {{company.name}} out for your {{job.service}}. If everything went well, a quick review helps us a lot. If anything wasn't right, just reply and we'll make it right." },
    { type: "WAIT", amount: 1, unit: "days" },
    { type: "SEND_SMS", body: "Thanks again from {{company.name}}! Mind leaving us a quick review? It means a lot." },
  ] },
  { key: "invoice_thanks", name: "Invoice paid: thank you", description: "Thank-you email and a customer tag when money lands.", trigger: "INVOICE_PAID", steps: [
    { type: "SEND_EMAIL", subject: "Payment received — thank you", body: "Hi {{contact.first_name}},\n\nWe've received your payment. Thank you for your business!\n\n{{company.name}}" },
    { type: "ADD_TAG", tag: "paid" },
  ] },
  { key: "stale_deal", name: "Deal moved to Proposal: 3-day chase", description: "Wait 3 days after a proposal, then email and task the rep.", trigger: "DEAL_STAGE_CHANGED", steps: [
    { type: "IF", field: "ctx.stage", op: "equals", value: "PROPOSAL" },
    { type: "WAIT", amount: 3, unit: "days" },
    { type: "SEND_EMAIL", subject: "Any questions on the proposal?", body: "Hi {{contact.first_name}},\n\nJust checking in on the proposal for {{deal.name}}. Happy to walk through it or adjust anything.\n\n{{rep}}" },
    { type: "CREATE_TASK", title: "Chase proposal with {{contact.name}}", dueInDays: 0 },
  ] },
];
