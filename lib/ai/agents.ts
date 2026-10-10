/**
 * Cyncro Agents: AI teammates a company defines itself. Each has a role, its
 * own instructions, a set of tools it may use, a schedule, a daily cap, and a
 * person it acts as (whose approval drawer receives anything it may not do on
 * its own). Runs reuse the assistant loop, so every read is grounded in the
 * company's data and every write is logged or waits for approval.
 */
import { coreDb, type TenantContext } from "@/lib/core/db";
import { ask, type AssistantReply } from "@/lib/ai/assistant";
import { TOOLS } from "@/lib/ai/tools";
import { companySettings } from "@/lib/core/companySettings";

const now = () => new Date().toISOString();
export const SCHEDULES = ["MANUAL", "HOURLY", "DAILY"] as const;
export type Schedule = (typeof SCHEDULES)[number];

export type AgentTemplate = { key: string; name: string; role: string; instructions: string; tools: string[]; schedule: Schedule; runHour: number; autoAct: boolean; dailyCap: number; blurb: string };
export const TEMPLATES: AgentTemplate[] = [
  { key: "lead_qualifier", name: "Lead qualifier", blurb: "Looks at today's new leads, scores them, tags the hot ones and hands the rep a task.", role: "Sales development rep", schedule: "HOURLY", runHour: 8, autoAct: true, dailyCap: 12, tools: ["workspace_summary", "search_contacts", "get_contact", "add_tag", "add_note", "create_task", "list_team"],
    instructions: "Each run: find contacts created in the last day that have no tag 'qualified' or 'not-a-fit'. For each, read their record. If they look like a real buyer (a business, a clear need, a phone or email), tag them 'qualified', add a one-line note on why, and create a task for their assigned rep (or the owner) to call them today. Otherwise tag 'not-a-fit' with a short note. Report how many you handled." },
  { key: "appointment_setter", name: "Appointment setter", blurb: "Finds qualified leads with no appointment and proposes booking links or bookings.", role: "Appointment setter", schedule: "DAILY", runHour: 9, autoAct: false, dailyCap: 10, tools: ["search_contacts", "get_contact", "list_bookings", "book_appointment", "create_task", "add_note"],
    instructions: "Each run: find contacts tagged 'qualified' with no upcoming booking. For each, propose booking the first appointment type at the next sensible business-hours slot (tomorrow or later), and add a note saying you proposed it. Keep proposals to the cap. Report who you queued." },
  { key: "daily_briefing", name: "Daily briefing", blurb: "Posts a morning summary to Team Chat: bookings, stale deals, overdue tasks and invoices.", role: "Chief of staff", schedule: "DAILY", runHour: 7, autoAct: true, dailyCap: 2, tools: ["workspace_summary", "list_bookings", "list_deals", "list_tasks", "list_invoices", "create_task"],
    instructions: "Each run: pull the workspace summary, today's bookings, deals stale for 7+ days, overdue tasks and unpaid invoices. Write a crisp briefing under 150 words: what's on today, what's slipping, the one thing to fix first. Create a single task for the owner titled 'Today's priority: …' with that one thing. Your reply is the briefing." },
  { key: "reviews", name: "Review requester", blurb: "After completed jobs or won deals, drafts a thank-you and asks for a review.", role: "Customer success", schedule: "DAILY", runHour: 17, autoAct: false, dailyCap: 10, tools: ["search_contacts", "get_contact", "list_jobs", "add_note", "create_task", "add_tag"],
    instructions: "Each run: find customers whose job completed or deal was won in the last 2 days and who are not tagged 'review-asked'. For each, propose a task for their rep: 'Send review request to {name}' with a short, warm message draft in the task details, and tag them 'review-asked'. Report the list." },
  { key: "collections", name: "Collections caller", blurb: "Turns overdue invoices into call tasks with a suggested script.", role: "Accounts receivable", schedule: "DAILY", runHour: 10, autoAct: true, dailyCap: 15, tools: ["list_invoices", "search_contacts", "get_contact", "create_task", "add_note"],
    instructions: "Each run: list SENT invoices past their due date. For each customer, create one task for the owner: 'Call {name} about invoice {number} ({amount}, {days} days late)' with a two-sentence friendly script in the details. Skip anyone who already has an open task mentioning their invoice number. Report totals." },
];

export type AgentRow = { id: string; tenant_id: string; name: string; role: string; instructions: string; tools_json: string; schedule: Schedule; run_hour: number; auto_act: number; daily_cap: number; run_as: string; active: number; template_key: string | null; last_run_at: string | null; created_by: string | null; created_at: string; updated_at: string };
export const TOOL_CATALOG = TOOLS.map((t) => ({ name: t.name, kind: t.kind, risk: t.risk || (t.kind === "write" ? "high" : "none"), description: t.description.split(".")[0] }));

export async function listAgents(tenantId: string): Promise<AgentRow[]> {
  return (await coreDb().prepare("SELECT * FROM cyncro_agents WHERE tenant_id=? ORDER BY created_at").bind(tenantId).all<AgentRow>()).results;
}
export async function findAgent(tenantId: string, idOrName: string): Promise<AgentRow | null> {
  return coreDb().prepare("SELECT * FROM cyncro_agents WHERE tenant_id=? AND (id=? OR lower(name)=lower(?)) LIMIT 1").bind(tenantId, idOrName, idOrName).first<AgentRow>();
}
const validTools = (names: unknown) => (Array.isArray(names) ? names.map(String).filter((n) => TOOLS.some((t) => t.name === n)) : []);

export async function createAgent(tenantId: string, by: string, input: Partial<AgentTemplate> & { templateKey?: string; runAs?: string }): Promise<AgentRow> {
  const tpl = input.templateKey ? TEMPLATES.find((t) => t.key === input.templateKey) : undefined;
  const name = String(input.name || tpl?.name || "").trim().slice(0, 80); if (!name) throw new Error("Give the agent a name.");
  const role = String(input.role || tpl?.role || "Assistant").trim().slice(0, 120);
  const instructions = String(input.instructions || tpl?.instructions || "").trim().slice(0, 6000); if (!instructions) throw new Error("Tell the agent what to do.");
  const tools = validTools(input.tools ?? tpl?.tools ?? []); if (!tools.length) throw new Error("Pick at least one tool.");
  const schedule = (SCHEDULES as readonly string[]).includes(String(input.schedule || tpl?.schedule || "MANUAL")) ? (String(input.schedule || tpl?.schedule || "MANUAL") as Schedule) : "MANUAL";
  const id = crypto.randomUUID();
  await coreDb().prepare("INSERT INTO cyncro_agents (id, tenant_id, name, role, instructions, tools_json, schedule, run_hour, auto_act, daily_cap, run_as, active, template_key, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)")
    .bind(id, tenantId, name, role, instructions, JSON.stringify(tools), schedule, Math.min(23, Math.max(0, Math.round(Number(input.runHour ?? tpl?.runHour ?? 8)))), input.autoAct ?? tpl?.autoAct ? 1 : 0, Math.min(500, Math.max(1, Math.round(Number(input.dailyCap ?? tpl?.dailyCap ?? 10)))), String(input.runAs || by).toLowerCase(), tpl?.key || null, by, now(), now()).run();
  return (await findAgent(tenantId, id))!;
}
export async function updateAgent(tenantId: string, id: string, patch: Record<string, unknown>): Promise<AgentRow | null> {
  const a = await findAgent(tenantId, id); if (!a) return null;
  const next = {
    name: patch.name !== undefined ? String(patch.name).trim().slice(0, 80) || a.name : a.name,
    role: patch.role !== undefined ? String(patch.role).trim().slice(0, 120) || a.role : a.role,
    instructions: patch.instructions !== undefined ? String(patch.instructions).trim().slice(0, 6000) || a.instructions : a.instructions,
    tools_json: patch.tools !== undefined ? JSON.stringify(validTools(patch.tools).length ? validTools(patch.tools) : JSON.parse(a.tools_json)) : a.tools_json,
    schedule: patch.schedule !== undefined && (SCHEDULES as readonly string[]).includes(String(patch.schedule)) ? String(patch.schedule) : a.schedule,
    run_hour: patch.runHour !== undefined ? Math.min(23, Math.max(0, Math.round(Number(patch.runHour)))) : a.run_hour,
    auto_act: patch.autoAct !== undefined ? (patch.autoAct ? 1 : 0) : a.auto_act,
    daily_cap: patch.dailyCap !== undefined ? Math.min(500, Math.max(1, Math.round(Number(patch.dailyCap)))) : a.daily_cap,
    run_as: patch.runAs !== undefined ? String(patch.runAs).toLowerCase() : a.run_as,
    active: patch.active !== undefined ? (patch.active ? 1 : 0) : a.active,
  };
  await coreDb().prepare("UPDATE cyncro_agents SET name=?, role=?, instructions=?, tools_json=?, schedule=?, run_hour=?, auto_act=?, daily_cap=?, run_as=?, active=?, updated_at=? WHERE id=? AND tenant_id=?")
    .bind(next.name, next.role, next.instructions, next.tools_json, next.schedule, next.run_hour, next.auto_act, next.daily_cap, next.run_as, next.active, now(), id, tenantId).run();
  return findAgent(tenantId, id);
}
export async function deleteAgent(tenantId: string, id: string) { await coreDb().prepare("DELETE FROM cyncro_agents WHERE id=? AND tenant_id=?").bind(id, tenantId).run(); }

async function runsToday(tenantId: string, agentId: string) {
  const r = await coreDb().prepare("SELECT COUNT(*) AS n FROM cyncro_agent_runs WHERE tenant_id=? AND agent_id=? AND started_at>=?").bind(tenantId, agentId, `${now().slice(0, 10)}T00:00:00.000Z`).first<{ n: number }>();
  return Number(r?.n || 0);
}
async function contextFor(tenantId: string, email: string): Promise<TenantContext | null> {
  const m = await coreDb().prepare("SELECT user_id, email, role FROM tenant_members WHERE tenant_id=? AND lower(email)=lower(?) AND active=1").bind(tenantId, email).first<{ user_id: string; email: string; role: string }>();
  return m ? { tenantId, userId: m.user_id, email: m.email, role: m.role as TenantContext["role"] } : null;
}

export type AgentRunResult = AssistantReply & { runId: string; capped?: boolean };
/** One run of an agent. Manual, scheduled, or from an automation step with a contact in context. */
export async function runCustomAgent(tenantId: string, agentId: string, o: { trigger: "manual" | "schedule" | "automation"; message?: string; contactId?: string; by?: string }): Promise<AgentRunResult> {
  const db = coreDb(); const a = await findAgent(tenantId, agentId); if (!a) throw new Error("Agent not found.");
  const runId = crypto.randomUUID(); const started = now();
  if (o.trigger !== "manual" && (await runsToday(tenantId, a.id)) >= a.daily_cap) {
    await db.prepare("INSERT INTO cyncro_agent_runs (id, tenant_id, agent_id, trigger, contact_id, input, reply, status, started_at, finished_at) VALUES (?,?,?,?,?,?,?,'CAPPED',?,?)").bind(runId, tenantId, a.id, o.trigger, o.contactId || null, o.message || null, "Daily cap reached; not run.", started, now()).run();
    return { runId, reply: "Daily cap reached; not run.", pending: [], acted: [], usage: { calls: 0, cap: 0 }, toolCalls: [], capped: true };
  }
  const tenant = await contextFor(tenantId, a.run_as); if (!tenant) throw new Error(`The agent acts as ${a.run_as}, who is no longer on this company. Edit the agent.`);
  const companyAuto = (await companySettings(tenantId)).aiAutoAct;
  let contactLine = "";
  if (o.contactId) { const c = await db.prepare("SELECT full_name, email, phone FROM crm_contacts WHERE id=? AND tenant_id=?").bind(o.contactId, tenantId).first<{ full_name: string; email: string | null; phone: string | null }>(); if (c) contactLine = `This run is about one contact: ${c.full_name} (id ${o.contactId}${c.email ? `, ${c.email}` : ""}${c.phone ? `, ${c.phone}` : ""}). Use get_contact with that id first.`; }
  const systemExtra = [
    `You are now running as a Cyncro Agent named "${a.name}" (${a.role}) for this company, unattended, on behalf of ${a.run_as}. There is no one chatting with you; do the work and report in plain words, under 200 words, with concrete names and numbers.`,
    `Your standing instructions:\n${a.instructions}`,
    `You may only use these tools: ${JSON.parse(a.tools_json).join(", ")}. Stop when the job is done; never loop over the same tool with the same arguments.`,
    a.auto_act && companyAuto ? "You may act on low-risk writes without asking; others are proposals." : "Every write you call is a proposal that waits for approval; say so in your report.",
    contactLine,
  ].filter(Boolean).join("\n");
  const message = o.message || `Run now (${o.trigger}). Do your job for this cycle and report.`;
  try {
    const r = await ask(tenant, message, `Agent: ${a.name}`, "agent", { systemExtra, allowedTools: JSON.parse(a.tools_json), autoAct: Boolean(a.auto_act) && companyAuto, remember: false, maxRounds: 12 });
    await db.prepare("INSERT INTO cyncro_agent_runs (id, tenant_id, agent_id, trigger, contact_id, input, reply, tool_calls_json, acted_json, pending_json, status, started_at, finished_at) VALUES (?,?,?,?,?,?,?,?,?,?,'DONE',?,?)")
      .bind(runId, tenantId, a.id, o.trigger, o.contactId || null, message, r.reply.slice(0, 8000), JSON.stringify(r.toolCalls), JSON.stringify(r.acted), JSON.stringify(r.pending.map((p) => ({ id: p.id, summary: p.summary }))), started, now()).run();
    await db.prepare("UPDATE cyncro_agents SET last_run_at=?, updated_at=? WHERE id=?").bind(now(), now(), a.id).run();
    return { ...r, runId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    await db.prepare("INSERT INTO cyncro_agent_runs (id, tenant_id, agent_id, trigger, contact_id, input, status, error, started_at, finished_at) VALUES (?,?,?,?,?,?,'FAILED',?,?,?)").bind(runId, tenantId, a.id, o.trigger, o.contactId || null, message, msg, started, now()).run();
    throw e;
  }
}

/** Cron: hourly agents at most once an hour; daily agents once a day at their hour (company timezone). */
export async function runScheduledAgents(): Promise<{ runs: number; failed: number }> {
  const db = coreDb(); let runs = 0, failed = 0;
  const { results } = await db.prepare("SELECT a.*, t.settings_json FROM cyncro_agents a JOIN tenants t ON t.id=a.tenant_id WHERE a.active=1 AND a.schedule<>'MANUAL'").all<AgentRow & { settings_json: string | null }>();
  for (const a of results) {
    const last = a.last_run_at ? new Date(a.last_run_at).getTime() : 0;
    let due = false;
    if (a.schedule === "HOURLY") due = Date.now() - last >= 55 * 60_000;
    else { const tz = (await companySettings(a.tenant_id)).timezone; const localHour = Number(new Date().toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false })); const lastDay = a.last_run_at ? new Date(a.last_run_at).toLocaleDateString("en-US", { timeZone: tz }) : ""; const today = new Date().toLocaleDateString("en-US", { timeZone: tz }); due = localHour >= a.run_hour && lastDay !== today; }
    if (!due) continue;
    try { await runCustomAgent(a.tenant_id, a.id, { trigger: "schedule" }); runs++; } catch (e) { failed++; console.error("cyncro_agent.failed", a.id, e); }
  }
  return { runs, failed };
}
