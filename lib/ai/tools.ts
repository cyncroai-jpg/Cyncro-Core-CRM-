/**
 * The one tool registry behind Cyncro AI. Both the in-app assistant and the
 * MCP server (/api/mcp) call these, so an outside assistant like Claude can do
 * exactly what the in-app one can, no more. Every tool runs inside one
 * company (tenantId) as one teammate (email + role), and every write is
 * gated by that teammate's role and written to the audit log.
 */
import { cleanText, coreDb, normalizeEmail } from "@/lib/core/db";
import { canTenantAct, type TenantAction } from "@/lib/core/tenantAuth";
import type { TenantContext } from "@/lib/core/db";
import { emitAutomationEvent, enroll, runEnrollment } from "@/lib/automations/engine";
import { companySettings } from "@/lib/core/companySettings";

export type ToolKind = "read" | "write";
export type ToolCtx = TenantContext & { via: "assistant" | "mcp" };
export type JsonSchema = { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
export type Tool = { name: string; description: string; kind: ToolKind; action?: TenantAction; /** low-risk writes may run without approval when the company allows it */ risk?: "low" | "high"; input_schema: JsonSchema; run: (ctx: ToolCtx, input: Record<string, unknown>) => Promise<unknown> };

const str = (v: unknown, max = 400) => cleanText(v, max);
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
const limitOf = (v: unknown, d = 20, max = 100) => Math.min(max, Math.max(1, num(v, d)));
const usd = (cents: unknown) => `$${(Number(cents || 0) / 100).toLocaleString()}`;
const iso = () => new Date().toISOString();
const dayRange = (range: string, tz: string) => {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const today = fmt.format(now);
  const startOf = (ymd: string) => new Date(`${ymd}T00:00:00`);
  if (range === "today") return { from: startOf(today), to: new Date(startOf(today).getTime() + 86_400_000) };
  if (range === "tomorrow") { const t = new Date(startOf(today).getTime() + 86_400_000); return { from: t, to: new Date(t.getTime() + 86_400_000) }; }
  if (range === "week") return { from: startOf(today), to: new Date(startOf(today).getTime() + 7 * 86_400_000) };
  if (range === "past") return { from: new Date(now.getTime() - 30 * 86_400_000), to: now };
  return { from: now, to: new Date(now.getTime() + 60 * 86_400_000) };
};

async function findContact(tenantId: string, idOrQuery: string) {
  const db = coreDb(); const q = str(idOrQuery, 160);
  if (!q) return null;
  const byId = await db.prepare("SELECT * FROM crm_contacts WHERE id=? AND tenant_id=?").bind(q, tenantId).first<Record<string, unknown>>();
  if (byId) return byId;
  const like = `%${q.toLowerCase()}%`;
  return db.prepare("SELECT * FROM crm_contacts WHERE tenant_id=? AND (lower(full_name) LIKE ? OR lower(COALESCE(email,'')) LIKE ? OR replace(replace(COALESCE(phone,''),'-',''),' ','') LIKE ?) ORDER BY updated_at DESC LIMIT 1").bind(tenantId, like, like, like).first<Record<string, unknown>>();
}
const contactCard = (c: Record<string, unknown>) => ({ id: c.id, name: c.full_name, email: c.email, phone: c.phone, title: c.title, lifecycle: c.lifecycle, source: c.source, assigned_rep: c.assigned_rep, lead_score: c.lead_score ?? 0, tags: (() => { try { return JSON.parse(String(c.tags || "[]")); } catch { return []; } })(), updated_at: c.updated_at });

async function audit(ctx: ToolCtx, action: string, resourceType: string, resourceId: string, details: Record<string, unknown>) {
  await coreDb().prepare("INSERT INTO audit_logs (id, tenant_id, user_id, email, action, resource_type, resource_id, details, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), ctx.tenantId, ctx.userId || null, ctx.email, action, resourceType, resourceId, JSON.stringify({ ...details, via: `cyncro-ai:${ctx.via}` }), iso()).run().catch(() => undefined);
}

export const TOOLS: Tool[] = [
  {
    name: "workspace_summary", kind: "read", description: "Counts and totals for this company right now: contacts, open deals and pipeline value, bookings today and this week, open tasks, active workflows, unpaid invoices. Call this first for any 'how are we doing' question.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    run: async (ctx) => {
      const db = coreDb(); const t = ctx.tenantId; const s = await companySettings(t);
      const today = dayRange("today", s.timezone); const week = dayRange("week", s.timezone);
      const n = async (sql: string, ...b: unknown[]) => (await db.prepare(sql).bind(...b).first<Record<string, number>>()) || {};
      const [contacts, deals, bToday, bWeek, tasks, wfs, invoices, jobs] = await Promise.all([
        n("SELECT COUNT(*) AS c, SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) AS new_week FROM crm_contacts WHERE tenant_id=?", new Date(Date.now() - 7 * 86_400_000).toISOString(), t),
        n("SELECT COUNT(*) AS c, COALESCE(SUM(value_cents),0) AS cents, SUM(CASE WHEN updated_at<? THEN 1 ELSE 0 END) AS stale FROM crm_opportunities WHERE tenant_id=? AND stage NOT LIKE 'CLOSED%'", new Date(Date.now() - 14 * 86_400_000).toISOString(), t),
        n("SELECT COUNT(*) AS c FROM calendar_bookings WHERE tenant_id=? AND status IN ('CONFIRMED','RESCHEDULED') AND starts_at>=? AND starts_at<?", t, today.from.toISOString(), today.to.toISOString()),
        n("SELECT COUNT(*) AS c FROM calendar_bookings WHERE tenant_id=? AND status IN ('CONFIRMED','RESCHEDULED') AND starts_at>=? AND starts_at<?", t, week.from.toISOString(), week.to.toISOString()),
        n("SELECT COUNT(*) AS c, SUM(CASE WHEN due_at<? THEN 1 ELSE 0 END) AS overdue FROM work_tasks WHERE tenant_id=? AND status NOT IN ('DONE')", iso(), t),
        n("SELECT COUNT(*) AS c FROM automation_workflows WHERE tenant_id=? AND active=1", t),
        n("SELECT COUNT(*) AS c, COALESCE(SUM(amount_cents),0) AS cents FROM crm_invoices WHERE tenant_id=? AND status='SENT'", t),
        n("SELECT COUNT(*) AS c FROM dispatch_jobs WHERE tenant_id=? AND status IN ('BOOKED','IN PROGRESS') AND scheduled_at>=? AND scheduled_at<?", t, today.from.toISOString(), today.to.toISOString()),
      ]);
      return { contacts: contacts.c || 0, new_contacts_this_week: contacts.new_week || 0, open_deals: deals.c || 0, open_pipeline: usd(deals.cents), stale_deals_14d: deals.stale || 0, bookings_today: bToday.c || 0, bookings_this_week: bWeek.c || 0, open_tasks: tasks.c || 0, overdue_tasks: tasks.overdue || 0, active_workflows: wfs.c || 0, unpaid_invoices: invoices.c || 0, unpaid_total: usd(invoices.cents), dispatch_jobs_today: jobs.c || 0, timezone: s.timezone };
    },
  },
  {
    name: "search_contacts", kind: "read", description: "Find contacts by name, email, phone, tag, lifecycle, source, or assigned rep. Returns up to `limit` matches, newest first.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "Free text matched against name, email, phone" }, tag: { type: "string" }, lifecycle: { type: "string", description: "LEAD, MQL, SQL, OPPORTUNITY, CUSTOMER, CHURNED" }, source: { type: "string" }, assigned_rep: { type: "string", description: "teammate email" }, limit: { type: "integer" } }, additionalProperties: false },
    run: async (ctx, i) => {
      const where = ["c.tenant_id=?"]; const b: unknown[] = [ctx.tenantId];
      const q = str(i.query, 160).toLowerCase(); if (q) { where.push("(lower(c.full_name) LIKE ? OR lower(COALESCE(c.email,'')) LIKE ? OR COALESCE(c.phone,'') LIKE ?)"); b.push(`%${q}%`, `%${q}%`, `%${q}%`); }
      if (str(i.tag)) { where.push("lower(COALESCE(c.tags,'')) LIKE ?"); b.push(`%"${str(i.tag).toLowerCase()}"%`); }
      if (str(i.lifecycle)) { where.push("upper(c.lifecycle)=?"); b.push(str(i.lifecycle).toUpperCase()); }
      if (str(i.source)) { where.push("upper(c.source)=?"); b.push(str(i.source).toUpperCase()); }
      if (str(i.assigned_rep)) { where.push("lower(c.assigned_rep)=?"); b.push(str(i.assigned_rep).toLowerCase()); }
      const { results } = await coreDb().prepare(`SELECT c.*, a.name AS company FROM crm_contacts c LEFT JOIN crm_accounts a ON a.id=c.account_id WHERE ${where.join(" AND ")} ORDER BY c.updated_at DESC LIMIT ?`).bind(...b, limitOf(i.limit)).all<Record<string, unknown>>();
      return { count: results.length, contacts: results.map((c) => ({ ...contactCard(c), company: c.company })) };
    },
  },
  {
    name: "get_contact", kind: "read", description: "Everything about one contact: profile, open deals, upcoming bookings, open tasks, and the last 15 activities (emails, texts, calls, notes, forms). Accepts a contact id or a name/email/phone.",
    input_schema: { type: "object", properties: { contact: { type: "string", description: "contact id, or a name / email / phone to look up" } }, required: ["contact"], additionalProperties: false },
    run: async (ctx, i) => {
      const c = await findContact(ctx.tenantId, String(i.contact || "")); if (!c) return { error: "No contact matched." };
      const db = coreDb(); const id = String(c.id);
      const [acts, deals, bookings, tasks, account] = await Promise.all([
        db.prepare("SELECT activity_type, title, details, status, created_by, created_at FROM crm_activities WHERE contact_id=? ORDER BY created_at DESC LIMIT 15").bind(id).all<Record<string, unknown>>(),
        db.prepare("SELECT id, name, stage, value_cents, probability, assigned_rep, expected_close_date, updated_at FROM crm_opportunities WHERE primary_contact_id=? AND tenant_id=? ORDER BY updated_at DESC LIMIT 10").bind(id, ctx.tenantId).all<Record<string, unknown>>(),
        db.prepare("SELECT b.id, e.name AS event, b.starts_at, b.status, b.assigned_to, b.location_mode FROM calendar_bookings b JOIN calendar_event_types e ON e.id=b.event_type_id WHERE b.contact_id=? AND b.starts_at>=? ORDER BY b.starts_at LIMIT 5").bind(id, new Date(Date.now() - 86_400_000).toISOString()).all<Record<string, unknown>>(),
        db.prepare("SELECT id, title, status, priority, assignee, due_at FROM work_tasks WHERE contact_id=? AND status<>'DONE' ORDER BY due_at LIMIT 10").bind(id).all<Record<string, unknown>>(),
        c.account_id ? db.prepare("SELECT name, domain, phone, address FROM crm_accounts WHERE id=?").bind(String(c.account_id)).first<Record<string, unknown>>() : Promise.resolve(null),
      ]);
      return { contact: { ...contactCard(c), notes: c.notes, company: account }, deals: deals.results.map((d) => ({ ...d, value: usd(d.value_cents) })), upcoming_bookings: bookings.results, open_tasks: tasks.results, recent_activity: acts.results };
    },
  },
  {
    name: "list_deals", kind: "read", description: "Open deals in the pipeline, optionally filtered by stage, rep, or 'stale for N days' (no update in that long). Sorted by value, largest first.",
    input_schema: { type: "object", properties: { stage: { type: "string" }, assigned_rep: { type: "string" }, stale_days: { type: "integer", description: "only deals untouched for at least this many days" }, include_closed: { type: "boolean" }, limit: { type: "integer" } }, additionalProperties: false },
    run: async (ctx, i) => {
      const where = ["o.tenant_id=?"]; const b: unknown[] = [ctx.tenantId];
      if (!i.include_closed) where.push("o.stage NOT LIKE 'CLOSED%'");
      if (str(i.stage)) { where.push("upper(o.stage)=?"); b.push(str(i.stage).toUpperCase()); }
      if (str(i.assigned_rep)) { where.push("lower(o.assigned_rep)=?"); b.push(str(i.assigned_rep).toLowerCase()); }
      if (num(i.stale_days, 0) > 0) { where.push("o.updated_at<?"); b.push(new Date(Date.now() - num(i.stale_days, 0) * 86_400_000).toISOString()); }
      const { results } = await coreDb().prepare(`SELECT o.id, o.name, o.stage, o.value_cents, o.probability, o.assigned_rep, o.expected_close_date, o.updated_at, c.full_name AS contact, c.id AS contact_id FROM crm_opportunities o LEFT JOIN crm_contacts c ON c.id=o.primary_contact_id WHERE ${where.join(" AND ")} ORDER BY o.value_cents DESC LIMIT ?`).bind(...b, limitOf(i.limit)).all<Record<string, unknown>>();
      return { count: results.length, total_value: usd(results.reduce((s, d) => s + Number(d.value_cents || 0), 0)), deals: results.map((d) => ({ ...d, value: usd(d.value_cents), days_since_update: Math.floor((Date.now() - new Date(String(d.updated_at)).getTime()) / 86_400_000) })) };
    },
  },
  {
    name: "list_bookings", kind: "read", description: "Appointments for a range: today, tomorrow, week, upcoming (next 60 days) or past (last 30 days). Optionally only one teammate's.",
    input_schema: { type: "object", properties: { range: { type: "string", enum: ["today", "tomorrow", "week", "upcoming", "past"] }, assigned_to: { type: "string", description: "teammate email" }, limit: { type: "integer" } }, additionalProperties: false },
    run: async (ctx, i) => {
      const s = await companySettings(ctx.tenantId); const r = dayRange(str(i.range) || "today", s.timezone);
      const where = ["b.tenant_id=?", "b.starts_at>=?", "b.starts_at<?"]; const b: unknown[] = [ctx.tenantId, r.from.toISOString(), r.to.toISOString()];
      if (str(i.assigned_to)) { where.push("lower(b.assigned_to)=?"); b.push(str(i.assigned_to).toLowerCase()); }
      const { results } = await coreDb().prepare(`SELECT b.id, e.name AS event, b.customer_name, b.customer_email, b.customer_phone, b.starts_at, b.ends_at, b.status, b.assigned_to, b.location_mode, b.meeting_address, b.contact_id FROM calendar_bookings b JOIN calendar_event_types e ON e.id=b.event_type_id WHERE ${where.join(" AND ")} ORDER BY b.starts_at LIMIT ?`).bind(...b, limitOf(i.limit, 30)).all<Record<string, unknown>>();
      return { timezone: s.timezone, count: results.length, bookings: results.map((x) => ({ ...x, local_time: new Date(String(x.starts_at)).toLocaleString("en-US", { timeZone: s.timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) })) };
    },
  },
  {
    name: "list_tasks", kind: "read", description: "Open tasks: mine (the current teammate's), a named teammate's, or everyone's. Includes overdue flag.",
    input_schema: { type: "object", properties: { scope: { type: "string", enum: ["mine", "all", "overdue"] }, assignee: { type: "string" }, limit: { type: "integer" } }, additionalProperties: false },
    run: async (ctx, i) => {
      const where = ["t.tenant_id=?", "t.status<>'DONE'"]; const b: unknown[] = [ctx.tenantId];
      const scope = str(i.scope) || "mine";
      if (str(i.assignee)) { where.push("lower(t.assignee)=?"); b.push(str(i.assignee).toLowerCase()); } else if (scope === "mine") { where.push("lower(t.assignee)=?"); b.push(ctx.email.toLowerCase()); }
      if (scope === "overdue") { where.push("t.due_at<?"); b.push(iso()); }
      const { results } = await coreDb().prepare(`SELECT t.id, t.title, t.status, t.priority, t.assignee, t.due_at, c.full_name AS contact FROM work_tasks t LEFT JOIN crm_contacts c ON c.id=t.contact_id WHERE ${where.join(" AND ")} ORDER BY COALESCE(t.due_at,'9999') LIMIT ?`).bind(...b, limitOf(i.limit, 30)).all<Record<string, unknown>>();
      return { count: results.length, tasks: results.map((t) => ({ ...t, overdue: Boolean(t.due_at && String(t.due_at) < iso()) })) };
    },
  },
  {
    name: "list_jobs", kind: "read", description: "Dispatch work orders (field jobs) for today, tomorrow, week, or upcoming, with customer, address, tech and status.",
    input_schema: { type: "object", properties: { range: { type: "string", enum: ["today", "tomorrow", "week", "upcoming"] }, status: { type: "string", description: "BOOKED, IN PROGRESS, COMPLETE, INVOICED, CANCELLED" }, limit: { type: "integer" } }, additionalProperties: false },
    run: async (ctx, i) => {
      const s = await companySettings(ctx.tenantId); const r = dayRange(str(i.range) || "today", s.timezone);
      const where = ["j.tenant_id=?", "j.scheduled_at>=?", "j.scheduled_at<?"]; const b: unknown[] = [ctx.tenantId, r.from.toISOString(), r.to.toISOString()];
      if (str(i.status)) { where.push("upper(j.status)=?"); b.push(str(i.status).toUpperCase()); }
      const { results } = await coreDb().prepare(`SELECT j.id, j.service_type, j.address, j.scheduled_at, j.status, j.revenue_cents, c.name AS customer, c.phone AS customer_phone, t.name AS technician FROM dispatch_jobs j LEFT JOIN dispatch_customers c ON c.id=j.customer_id LEFT JOIN dispatch_technicians t ON t.id=j.assigned_tech_id WHERE ${where.join(" AND ")} ORDER BY j.scheduled_at LIMIT ?`).bind(...b, limitOf(i.limit, 30)).all<Record<string, unknown>>();
      return { count: results.length, jobs: results.map((j) => ({ ...j, revenue: usd(j.revenue_cents) })) };
    },
  },
  {
    name: "list_invoices", kind: "read", description: "Invoices by status (DRAFT, SENT, PAID, VOID). SENT with a past due date are overdue.",
    input_schema: { type: "object", properties: { status: { type: "string" }, limit: { type: "integer" } }, additionalProperties: false },
    run: async (ctx, i) => {
      const where = ["tenant_id=?"]; const b: unknown[] = [ctx.tenantId];
      if (str(i.status)) { where.push("upper(status)=?"); b.push(str(i.status).toUpperCase()); }
      const { results } = await coreDb().prepare(`SELECT id, invoice_number, client_name, client_email, description, amount_cents, due_date, status, paid_at, created_at FROM crm_invoices WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ?`).bind(...b, limitOf(i.limit, 30)).all<Record<string, unknown>>();
      const today = iso().slice(0, 10);
      return { count: results.length, invoices: results.map((x) => ({ ...x, amount: usd(x.amount_cents), overdue: x.status === "SENT" && Boolean(x.due_date && String(x.due_date) < today) })) };
    },
  },
  {
    name: "list_workflows", kind: "read", description: "Automation workflows in this company with their trigger, on/off state, and how many people are in them.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    run: async (ctx) => {
      const { results } = await coreDb().prepare("SELECT w.id, w.name, w.trigger, w.active, w.enrolled_count, w.completed_count, (SELECT COUNT(*) FROM automation_enrollments e WHERE e.workflow_id=w.id AND e.status='ACTIVE') AS running FROM automation_workflows w WHERE w.tenant_id=? ORDER BY w.updated_at DESC").bind(ctx.tenantId).all<Record<string, unknown>>();
      return { workflows: results };
    },
  },
  {
    name: "list_team", kind: "read", description: "Teammates in this company with roles, for assigning work.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    run: async (ctx) => ({ team: (await coreDb().prepare("SELECT email, display_name, role FROM tenant_members WHERE tenant_id=? AND active=1 ORDER BY display_name").bind(ctx.tenantId).all()).results }),
  },
  // ── writes ──────────────────────────────────────────────────────────────
  {
    name: "create_contact", kind: "write", risk: "low", action: "create", description: "Create a new contact (and a company record if a company is named). Needs a name and an email or phone.",
    input_schema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, company: { type: "string" }, title: { type: "string" }, source: { type: "string" }, notes: { type: "string" }, assigned_rep: { type: "string" } }, required: ["name"], additionalProperties: false },
    run: async (ctx, i) => {
      const db = coreDb(); const name = str(i.name, 160); const email = normalizeEmail(i.email); const phone = str(i.phone, 40) || null;
      if (!name) return { error: "A name is required." }; if (!email && !phone) return { error: "An email or phone is required." };
      if (email) { const dup = await db.prepare("SELECT id, full_name FROM crm_contacts WHERE tenant_id=? AND lower(email)=?").bind(ctx.tenantId, email).first<Record<string, unknown>>(); if (dup) return { error: `A contact with that email already exists: ${dup.full_name} (${dup.id}).` }; }
      const now = iso(); const company = str(i.company, 160); let accountId: string | null = null;
      if (company) {
        const existing = await db.prepare("SELECT id FROM crm_accounts WHERE tenant_id=? AND lower(name)=lower(?) LIMIT 1").bind(ctx.tenantId, company).first<{ id: string }>();
        accountId = existing?.id || crypto.randomUUID();
        if (!existing) await db.prepare("INSERT INTO crm_accounts (id,name,owner_email,source,status,tenant_id,created_at,updated_at) VALUES (?,?,?,?, 'ACTIVE',?,?,?)").bind(accountId, company, ctx.email, str(i.source, 80) || "AI", ctx.tenantId, now, now).run();
      }
      const id = crypto.randomUUID();
      await db.prepare("INSERT INTO crm_contacts (id,account_id,full_name,email,phone,title,lifecycle,assigned_rep,source,notes,tenant_id,created_at,updated_at) VALUES (?,?,?,?,?,?,'LEAD',?,?,?,?,?,?)").bind(id, accountId, name, email, phone, str(i.title, 120) || null, str(i.assigned_rep, 160).toLowerCase() || ctx.email, str(i.source, 80) || "AI", str(i.notes, 5000) || null, ctx.tenantId, now, now).run();
      await audit(ctx, "CREATE", "contact", id, { name });
      await emitAutomationEvent(ctx.tenantId, "CONTACT_CREATED", { contactId: id, accountId, source: str(i.source, 80) || "AI", trigger: "CONTACT_CREATED" });
      return { created: true, contact_id: id, name };
    },
  },
  {
    name: "update_contact", kind: "write", action: "edit", description: "Change a contact's lifecycle, assigned rep, title, phone, email, or notes. Only the fields you pass change.",
    input_schema: { type: "object", properties: { contact: { type: "string" }, lifecycle: { type: "string" }, assigned_rep: { type: "string" }, title: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, notes: { type: "string" } }, required: ["contact"], additionalProperties: false },
    run: async (ctx, i) => {
      const c = await findContact(ctx.tenantId, String(i.contact || "")); if (!c) return { error: "No contact matched." };
      const sets: string[] = []; const b: unknown[] = [];
      const put = (col: string, v: unknown) => { sets.push(`${col}=?`); b.push(v); };
      if (i.lifecycle !== undefined) put("lifecycle", str(i.lifecycle, 40).toUpperCase()); if (i.assigned_rep !== undefined) put("assigned_rep", str(i.assigned_rep, 160).toLowerCase() || null);
      if (i.title !== undefined) put("title", str(i.title, 120) || null); if (i.phone !== undefined) put("phone", str(i.phone, 40) || null);
      if (i.email !== undefined) { const e = normalizeEmail(i.email); if (i.email && !e) return { error: "That email is not valid." }; put("email", e || null); }
      if (i.notes !== undefined) put("notes", str(i.notes, 5000) || null);
      if (!sets.length) return { error: "Nothing to change." };
      const now = iso(); sets.push("updated_at=?"); b.push(now, String(c.id), ctx.tenantId);
      await coreDb().prepare(`UPDATE crm_contacts SET ${sets.join(", ")} WHERE id=? AND tenant_id=?`).bind(...b).run();
      await audit(ctx, "UPDATE", "contact", String(c.id), { fields: sets.map((s) => s.split("=")[0]) });
      if (i.lifecycle !== undefined || i.assigned_rep !== undefined) await emitAutomationEvent(ctx.tenantId, "CONTACT_UPDATED", { contactId: String(c.id), changed: sets.map((s) => s.split("=")[0]).join(","), field: sets[0].split("=")[0], by: ctx.email, trigger: "CONTACT_UPDATED" });
      return { updated: true, contact_id: c.id, name: c.full_name };
    },
  },
  {
    name: "add_tag", kind: "write", risk: "low", action: "edit", description: "Add a tag to a contact. Fires any 'Tag added' automations.",
    input_schema: { type: "object", properties: { contact: { type: "string" }, tag: { type: "string" } }, required: ["contact", "tag"], additionalProperties: false },
    run: async (ctx, i) => {
      const c = await findContact(ctx.tenantId, String(i.contact || "")); if (!c) return { error: "No contact matched." };
      const tag = str(i.tag, 60).toLowerCase(); if (!tag) return { error: "Tag is required." };
      let tags: string[] = []; try { tags = JSON.parse(String(c.tags || "[]")); } catch { tags = []; }
      if (!tags.includes(tag)) { tags.push(tag); await coreDb().prepare("UPDATE crm_contacts SET tags=?, updated_at=? WHERE id=?").bind(JSON.stringify(tags), iso(), String(c.id)).run(); await emitAutomationEvent(ctx.tenantId, "TAG_ADDED", { contactId: String(c.id), tag, trigger: "TAG_ADDED" }); }
      await audit(ctx, "UPDATE", "contact", String(c.id), { tag });
      return { tagged: true, contact_id: c.id, tags };
    },
  },
  {
    name: "add_note", kind: "write", risk: "low", action: "create", description: "Add a note to a contact's timeline.",
    input_schema: { type: "object", properties: { contact: { type: "string" }, text: { type: "string" } }, required: ["contact", "text"], additionalProperties: false },
    run: async (ctx, i) => {
      const c = await findContact(ctx.tenantId, String(i.contact || "")); if (!c) return { error: "No contact matched." };
      const text = str(i.text, 5000); if (!text) return { error: "Note text is required." }; const now = iso(); const id = crypto.randomUUID();
      await coreDb().prepare("INSERT INTO crm_activities (id,contact_id,activity_type,title,details,status,created_by,tenant_id,created_at,updated_at) VALUES (?,?,'NOTE',?,?,'COMPLETED',?,?,?,?)").bind(id, String(c.id), text.slice(0, 80), text, ctx.email, ctx.tenantId, now, now).run();
      await audit(ctx, "CREATE", "note", id, { contactId: c.id });
      return { added: true, contact_id: c.id, name: c.full_name };
    },
  },
  {
    name: "create_task", kind: "write", risk: "low", action: "create", description: "Create a task, optionally for a teammate and tied to a contact. due_in_days defaults to 1.",
    input_schema: { type: "object", properties: { title: { type: "string" }, assignee: { type: "string", description: "teammate email; defaults to the current teammate" }, contact: { type: "string" }, due_in_days: { type: "integer" }, priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] }, details: { type: "string" } }, required: ["title"], additionalProperties: false },
    run: async (ctx, i) => {
      const title = str(i.title, 200); if (!title) return { error: "Title is required." };
      const c = str(i.contact) ? await findContact(ctx.tenantId, String(i.contact)) : null;
      const now = iso(); const id = crypto.randomUUID(); const due = new Date(Date.now() + Math.max(0, num(i.due_in_days, 1)) * 86_400_000).toISOString();
      const assignee = str(i.assignee, 160).toLowerCase() || ctx.email;
      await coreDb().prepare("INSERT INTO work_tasks (id,title,details,status,priority,assignee,reporter,contact_id,due_at,estimated_minutes,tenant_id,created_at,updated_at) VALUES (?,?,?,'TODO',?,?,?,?,?,30,?,?,?)").bind(id, title, str(i.details, 4000) || null, ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(str(i.priority).toUpperCase()) ? str(i.priority).toUpperCase() : "MEDIUM", assignee, ctx.email, c ? String(c.id) : null, due, ctx.tenantId, now, now).run();
      if (assignee !== ctx.email) await coreDb().prepare("INSERT INTO workspace_notifications (id,recipient,title,body,entity_type,entity_id,created_at) VALUES (?,?,?,?,'TASK',?,?)").bind(crypto.randomUUID(), assignee, "New task", title, id, now).run();
      await audit(ctx, "CREATE", "task", id, { title, assignee });
      return { created: true, task_id: id, title, assignee, due_at: due, contact: c ? c.full_name : null };
    },
  },
  {
    name: "complete_task", kind: "write", risk: "low", action: "edit", description: "Mark a task done by id or exact title.",
    input_schema: { type: "object", properties: { task: { type: "string", description: "task id or title" } }, required: ["task"], additionalProperties: false },
    run: async (ctx, i) => {
      const db = coreDb(); const q = str(i.task, 200);
      const t = await db.prepare("SELECT id, title, contact_id, assignee FROM work_tasks WHERE tenant_id=? AND status<>'DONE' AND (id=? OR lower(title)=lower(?)) ORDER BY due_at LIMIT 1").bind(ctx.tenantId, q, q).first<Record<string, unknown>>();
      if (!t) return { error: "No open task matched." }; const now = iso();
      await db.prepare("UPDATE work_tasks SET status='DONE', completed_at=?, updated_at=? WHERE id=?").bind(now, now, String(t.id)).run();
      await audit(ctx, "UPDATE", "task", String(t.id), { status: "DONE" });
      if (t.contact_id) await emitAutomationEvent(ctx.tenantId, "TASK_COMPLETED", { contactId: String(t.contact_id), taskId: String(t.id), taskTitle: String(t.title), assignedTo: t.assignee, by: ctx.email, trigger: "TASK_COMPLETED" });
      return { completed: true, task_id: t.id, title: t.title };
    },
  },
  {
    name: "create_deal", kind: "write", risk: "low", action: "create", description: "Open a deal for a contact in the default pipeline. value is in dollars.",
    input_schema: { type: "object", properties: { contact: { type: "string" }, name: { type: "string" }, value: { type: "number" }, stage: { type: "string" } }, required: ["contact", "name"], additionalProperties: false },
    run: async (ctx, i) => {
      const db = coreDb(); const c = await findContact(ctx.tenantId, String(i.contact || "")); if (!c) return { error: "No contact matched." };
      const pipeline = await db.prepare("SELECT id FROM crm_pipelines WHERE tenant_id=? AND active=1 ORDER BY is_default DESC, created_at LIMIT 1").bind(ctx.tenantId).first<{ id: string }>();
      const first = pipeline ? await db.prepare("SELECT name FROM crm_pipeline_stages WHERE pipeline_id=? ORDER BY position LIMIT 1").bind(pipeline.id).first<{ name: string }>() : null;
      let accountId = String(c.account_id || ""); const now = iso();
      if (!accountId) { accountId = crypto.randomUUID(); await db.prepare("INSERT INTO crm_accounts (id,name,owner_email,source,status,tenant_id,created_at,updated_at) VALUES (?,?,?,?, 'ACTIVE',?,?,?)").bind(accountId, String(c.full_name), ctx.email, "AI", ctx.tenantId, now, now).run(); await db.prepare("UPDATE crm_contacts SET account_id=? WHERE id=?").bind(accountId, String(c.id)).run(); }
      const id = crypto.randomUUID(); const stage = str(i.stage, 60).toUpperCase() || first?.name || "NEW LEAD"; const cents = Math.round(Math.max(0, num(i.value, 0)) * 100);
      await db.prepare("INSERT INTO crm_opportunities (id,account_id,primary_contact_id,pipeline_id,name,stage,value_cents,probability,assigned_rep,source,tenant_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,10,?,'AI',?,?,?)").bind(id, accountId, String(c.id), pipeline?.id || null, str(i.name, 160), stage, cents, String(c.assigned_rep || ctx.email), ctx.tenantId, now, now).run();
      await audit(ctx, "CREATE", "deal", id, { name: str(i.name, 160), value: cents });
      return { created: true, deal_id: id, stage, value: usd(cents) };
    },
  },
  {
    name: "move_deal", kind: "write", action: "edit", description: "Move a deal to a stage (e.g. QUALIFIED, PROPOSAL, CLOSED WON, CLOSED LOST). Fires stage / won / lost automations.",
    input_schema: { type: "object", properties: { deal: { type: "string", description: "deal id or exact deal name" }, stage: { type: "string" } }, required: ["deal", "stage"], additionalProperties: false },
    run: async (ctx, i) => {
      const db = coreDb(); const q = str(i.deal, 200); const stage = str(i.stage, 60).toUpperCase(); if (!stage) return { error: "Stage is required." };
      const d = await db.prepare("SELECT id, name, stage, primary_contact_id, value_cents FROM crm_opportunities WHERE tenant_id=? AND (id=? OR lower(name)=lower(?)) LIMIT 1").bind(ctx.tenantId, q, q).first<Record<string, unknown>>();
      if (!d) return { error: "No deal matched." }; const now = iso();
      await db.prepare("UPDATE crm_opportunities SET stage=?, updated_at=? WHERE id=?").bind(stage, now, String(d.id)).run();
      await audit(ctx, "UPDATE", "deal", String(d.id), { from: d.stage, to: stage });
      const base = { contactId: String(d.primary_contact_id || ""), dealId: String(d.id), dealName: String(d.name), stage, valueCents: d.value_cents, by: ctx.email };
      await emitAutomationEvent(ctx.tenantId, "DEAL_STAGE_CHANGED", { ...base, trigger: "DEAL_STAGE_CHANGED" });
      if (stage === "CLOSED WON") await emitAutomationEvent(ctx.tenantId, "DEAL_WON", { ...base, trigger: "DEAL_WON" });
      if (stage === "CLOSED LOST") await emitAutomationEvent(ctx.tenantId, "DEAL_LOST", { ...base, trigger: "DEAL_LOST" });
      return { moved: true, deal_id: d.id, name: d.name, from: d.stage, to: stage };
    },
  },
  {
    name: "book_appointment", kind: "write", risk: "low", action: "create", description: "Book an appointment for a contact at a specific time (ISO 8601 with timezone offset, or 'YYYY-MM-DD HH:MM' in the company timezone). Picks the event type by name. Checks capacity; confirmation emails and reminders are handled by the company's automations.",
    input_schema: { type: "object", properties: { contact: { type: "string" }, event_type: { type: "string", description: "appointment type name or slug" }, starts_at: { type: "string" }, location_mode: { type: "string", enum: ["VIDEO", "PHONE", "IN_PERSON"] }, notes: { type: "string" } }, required: ["contact", "event_type", "starts_at"], additionalProperties: false },
    run: async (ctx, i) => {
      const db = coreDb(); const c = await findContact(ctx.tenantId, String(i.contact || "")); if (!c) return { error: "No contact matched." };
      if (!c.email) return { error: "That contact has no email; bookings need one." };
      const et = await db.prepare("SELECT * FROM calendar_event_types WHERE tenant_id=? AND active=1 AND (slug=? OR lower(name)=lower(?)) LIMIT 1").bind(ctx.tenantId, str(i.event_type, 120), str(i.event_type, 120)).first<Record<string, unknown>>();
      if (!et) return { error: "No appointment type by that name. Use list_event_types via the Calendar tab names." };
      const s = await companySettings(ctx.tenantId); let starts = new Date(str(i.starts_at, 40));
      if (Number.isNaN(starts.getTime())) return { error: "Could not read starts_at. Use ISO 8601 like 2026-10-02T14:00:00-04:00." };
      if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(str(i.starts_at, 40))) { const guess = new Date(str(i.starts_at, 40).replace(" ", "T")); const offsetMin = (new Date(guess.toLocaleString("en-US", { timeZone: s.timezone })).getTime() - guess.getTime()) / 60000; starts = new Date(guess.getTime() - offsetMin * 60000); }
      const ends = new Date(starts.getTime() + Number(et.duration_minutes) * 60_000);
      const conflict = await db.prepare("SELECT COUNT(*) AS total FROM calendar_bookings WHERE event_type_id=? AND tenant_id=? AND status IN ('CONFIRMED','RESCHEDULED') AND starts_at<? AND ends_at>?").bind(String(et.id), ctx.tenantId, ends.toISOString(), starts.toISOString()).first<{ total: number }>();
      if (Number(conflict?.total || 0) >= Number(et.capacity || 1)) return { error: "That time is already taken." };
      const modes: string[] = (() => { try { return JSON.parse(String(et.location_modes || '["VIDEO"]')); } catch { return ["VIDEO"]; } })();
      const mode = ["VIDEO", "PHONE", "IN_PERSON"].includes(str(i.location_mode)) ? str(i.location_mode) : modes[0] || "VIDEO";
      const now = iso(); const id = crypto.randomUUID(); const host = String(et.host_name || c.assigned_rep || ctx.email);
      await db.prepare("INSERT INTO calendar_bookings (id,event_type_id,account_id,contact_id,customer_name,customer_email,customer_phone,starts_at,ends_at,timezone,location_mode,meeting_address,video_platform,status,notes,created_by,assigned_to,tenant_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,?,'CONFIRMED',?,?,?,?,?,?)")
        .bind(id, String(et.id), c.account_id || null, String(c.id), String(c.full_name), String(c.email), c.phone || null, starts.toISOString(), ends.toISOString(), s.timezone, mode, mode === "VIDEO" ? "GOOGLE_MEET" : null, str(i.notes, 2000) || null, ctx.email, host, ctx.tenantId, now, now).run();
      await db.prepare("INSERT INTO crm_activities (id,contact_id,activity_type,title,details,due_at,status,created_by,tenant_id,created_at,updated_at) VALUES (?,?,'CALENDAR',?,?,?,'COMPLETED',?,?,?,?)").bind(crypto.randomUUID(), String(c.id), `Booked ${String(et.name)}`, mode, starts.toISOString(), ctx.email, ctx.tenantId, now, now).run();
      await audit(ctx, "CREATE", "booking", id, { event: et.name, startsAt: starts.toISOString() });
      await emitAutomationEvent(ctx.tenantId, "BOOKING_CREATED", { contactId: String(c.id), bookingId: id, customerName: c.full_name, customerEmail: c.email, customerPhone: c.phone, startsAt: starts.toISOString(), eventName: String(et.name), eventSlug: et.slug, eventTypeId: et.id, assignedTo: host, trigger: "BOOKING_CREATED" });
      return { booked: true, booking_id: id, event: et.name, starts_at: starts.toISOString(), local_time: starts.toLocaleString("en-US", { timeZone: s.timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), host };
    },
  },
  {
    name: "enroll_in_workflow", kind: "write", action: "edit", description: "Put a contact into an automation workflow now (by workflow name or id).",
    input_schema: { type: "object", properties: { contact: { type: "string" }, workflow: { type: "string" } }, required: ["contact", "workflow"], additionalProperties: false },
    run: async (ctx, i) => {
      const db = coreDb(); const c = await findContact(ctx.tenantId, String(i.contact || "")); if (!c) return { error: "No contact matched." };
      const q = str(i.workflow, 160);
      const wf = await db.prepare("SELECT id, name, active FROM automation_workflows WHERE tenant_id=? AND (id=? OR lower(name)=lower(?)) LIMIT 1").bind(ctx.tenantId, q, q).first<Record<string, unknown>>();
      if (!wf) return { error: "No workflow by that name." }; if (!Number(wf.active)) return { error: `"${wf.name}" is paused.` };
      const id = await enroll(ctx.tenantId, String(wf.id), { contactId: String(c.id), trigger: "MANUAL", by: ctx.email });
      if (!id) return { error: `${c.full_name} is already in "${wf.name}" (or its re-enroll rule blocks it).` };
      await runEnrollment(id);
      const en = await db.prepare("SELECT status, last_error FROM automation_enrollments WHERE id=?").bind(id).first<Record<string, unknown>>();
      await audit(ctx, "WORKFLOW_TRIGGER", "workflow", String(wf.id), { contactId: c.id });
      return { enrolled: true, workflow: wf.name, status: en?.status, error: en?.last_error || undefined };
    },
  },
  {
    name: "create_job", kind: "write", risk: "low", action: "create", description: "Book a Dispatch field job for a contact: service type, address (defaults to the contact's), when (ISO 8601 or 'YYYY-MM-DD HH:MM' in the company timezone; defaults to tomorrow 9am), optional revenue in dollars. Only when the company uses Dispatch.",
    input_schema: { type: "object", properties: { contact: { type: "string" }, service_type: { type: "string" }, address: { type: "string" }, scheduled_at: { type: "string" }, revenue: { type: "number" }, notes: { type: "string" } }, required: ["contact", "service_type"], additionalProperties: false },
    run: async (ctx, i) => {
      const db = coreDb(); const c = await findContact(ctx.tenantId, String(i.contact || "")); if (!c) return { error: "No contact matched." };
      let cust = await db.prepare("SELECT id FROM dispatch_customers WHERE tenant_id=? AND (contact_id=? OR (email IS NOT NULL AND lower(email)=lower(?))) LIMIT 1").bind(ctx.tenantId, String(c.id), str(c.email)).first<{ id: string }>();
      const t = iso();
      if (!cust) { const cid = crypto.randomUUID(); await db.prepare("INSERT INTO dispatch_customers (id,tenant_id,name,phone,email,contact_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(cid, ctx.tenantId, str(c.full_name), str(c.phone) || null, str(c.email) || null, String(c.id), t, t).run(); cust = { id: cid }; }
      const s = await companySettings(ctx.tenantId); let when: Date;
      if (i.scheduled_at) { const raw = str(i.scheduled_at, 40); when = new Date(raw); if (Number.isNaN(when.getTime())) return { error: "Could not read scheduled_at." }; if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) { const guess = new Date(raw.replace(" ", "T")); const offsetMin = (new Date(guess.toLocaleString("en-US", { timeZone: s.timezone })).getTime() - guess.getTime()) / 60000; when = new Date(guess.getTime() - offsetMin * 60000); } }
      else { when = new Date(Date.now() + 86_400_000); when.setHours(9, 0, 0, 0); }
      const id = crypto.randomUUID(); const address = str(i.address, 300) || str(c.address, 300) || "";
      await db.prepare("INSERT INTO dispatch_jobs (id,tenant_id,customer_id,service_type,description,address,scheduled_at,status,revenue_cents,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'BOOKED',?,?,?)")
        .bind(id, ctx.tenantId, cust.id, str(i.service_type, 120), str(i.notes, 2000) || `Booked by Cyncro AI for ${ctx.email}`, address, when.toISOString(), Math.max(0, Math.round(num(i.revenue, 0) * 100)), t, t).run();
      await audit(ctx, "CREATE", "booking", id, { contactId: c.id });
      return { created: true, jobId: id, customer: c.full_name, service: str(i.service_type, 120), scheduled_at: when.toISOString(), address };
    },
  },
];

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);

/** Run a tool for a teammate, enforcing role for writes. Never throws; returns {error} instead. */
export async function runTool(ctx: ToolCtx, name: string, input: Record<string, unknown>): Promise<unknown> {
  const tool = toolByName(name);
  if (!tool) return { error: `Unknown tool ${name}` };
  if (tool.kind === "write" && !canTenantAct(ctx, tool.action || "edit")) return { error: `Your role (${ctx.role}) can't do that in this workspace.` };
  try { return await tool.run(ctx, input || {}); } catch (error) { console.error("ai.tool_failed", name, error); return { error: error instanceof Error ? error.message : "Tool failed" }; }
}

/** Short human line for a pending write, shown before the teammate approves it. */
export function describeAction(name: string, input: Record<string, unknown>): string {
  const s = (k: string) => String(input[k] ?? "");
  switch (name) {
    case "create_contact": return `Create contact ${s("name")}${s("email") ? ` (${s("email")})` : ""}${s("company") ? ` at ${s("company")}` : ""}`;
    case "update_contact": return `Update ${s("contact")}: ${Object.entries(input).filter(([k]) => k !== "contact").map(([k, v]) => `${k} → ${String(v)}`).join(", ")}`;
    case "add_tag": return `Tag ${s("contact")} with "${s("tag")}"`;
    case "add_note": return `Add a note to ${s("contact")}: "${s("text").slice(0, 80)}"`;
    case "create_task": return `Create task "${s("title")}"${s("assignee") ? ` for ${s("assignee")}` : ""}${s("contact") ? ` on ${s("contact")}` : ""}`;
    case "complete_task": return `Mark task "${s("task")}" done`;
    case "create_deal": return `Open deal "${s("name")}" for ${s("contact")}${input.value ? ` at $${Number(input.value).toLocaleString()}` : ""}`;
    case "move_deal": return `Move deal "${s("deal")}" to ${s("stage")}`;
    case "book_appointment": return `Book ${s("event_type")} for ${s("contact")} at ${s("starts_at")}`;
    case "enroll_in_workflow": return `Start workflow "${s("workflow")}" for ${s("contact")}`;
    case "create_job": return `Book a ${s("service_type")} job for ${s("contact")}${s("scheduled_at") ? ` at ${s("scheduled_at")}` : " tomorrow 9am"}`;
    default: return `${name} ${JSON.stringify(input)}`;
  }
}
