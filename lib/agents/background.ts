/**
 * Background agents: per-company workers that run on the cron without being
 * asked, inside a daily cap, and write a plain report of what they did.
 *
 *   FOLLOW_UP   — open deals or contacts with no activity for N days get a
 *                 follow-up task for their rep (one open task per contact).
 *   BOOKING_FILLER — waitlist entries whose preferred date/time is free get
 *                 booked, and the booking automations fire (confirmations).
 *   COLLECTIONS — overdue invoices get a reminder email every N days; after
 *                 the second reminder the owner gets a task.
 *
 * Deterministic on purpose: they never need the model, so they run even when
 * Cyncro AI itself is switched off, and every action is a normal record.
 */
import { coreDb } from "@/lib/core/db";
import { companySettings, withinBusinessHours } from "@/lib/core/companySettings";
import { emitAutomationEvent } from "@/lib/automations/engine";
import { sendEmail } from "@/lib/core/email";

export type AgentKind = "FOLLOW_UP" | "BOOKING_FILLER" | "COLLECTIONS";
export const AGENT_KINDS: { kind: AgentKind; name: string; what: string; defaults: Record<string, number>; fields: { key: string; label: string; min: number; max: number }[] }[] = [
  { kind: "FOLLOW_UP", name: "Follow-up agent", what: "Finds open deals and contacts that have gone quiet and gives their rep a follow-up task. One open task per person, never duplicates.", defaults: { staleDays: 7, dailyCap: 25 }, fields: [{ key: "staleDays", label: "Quiet for (days)", min: 1, max: 90 }, { key: "dailyCap", label: "Max tasks a day", min: 1, max: 200 }] },
  { kind: "BOOKING_FILLER", name: "Booking filler", what: "Watches the waitlist. When someone's preferred date and time is free, it books them and your confirmation automations go out.", defaults: { dailyCap: 20 }, fields: [{ key: "dailyCap", label: "Max bookings a day", min: 1, max: 200 }] },
  { kind: "COLLECTIONS", name: "Collections agent", what: "Emails a polite reminder for each overdue invoice every few days, with the payment link. After the second reminder it hands the owner a task.", defaults: { everyDays: 3, dailyCap: 30 }, fields: [{ key: "everyDays", label: "Remind every (days)", min: 1, max: 30 }, { key: "dailyCap", label: "Max emails a day", min: 1, max: 300 }] },
];
const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

export type AgentRow = { id: string; tenant_id: string; kind: AgentKind; enabled: number; settings_json: string | null; last_run_at: string | null };
export function settingsOf(row: Pick<AgentRow, "kind" | "settings_json">): Record<string, number> {
  const def = AGENT_KINDS.find((k) => k.kind === row.kind)?.defaults || {};
  let o: Record<string, unknown> = {}; try { o = JSON.parse(row.settings_json || "{}"); } catch { o = {}; }
  const out: Record<string, number> = { ...def };
  for (const k of Object.keys(def)) if (o[k] !== undefined && Number.isFinite(Number(o[k]))) out[k] = Number(o[k]);
  return out;
}
export async function agentsFor(tenantId: string): Promise<AgentRow[]> {
  const db = coreDb();
  const { results } = await db.prepare("SELECT id, tenant_id, kind, enabled, settings_json, last_run_at FROM background_agents WHERE tenant_id=?").bind(tenantId).all<AgentRow>();
  for (const k of AGENT_KINDS) if (!results.some((r) => r.kind === k.kind)) {
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO background_agents (id, tenant_id, kind, enabled, settings_json, created_at, updated_at) VALUES (?,?,?,0,'{}',?,?)").bind(id, tenantId, k.kind, now(), now()).run();
    results.push({ id, tenant_id: tenantId, kind: k.kind, enabled: 0, settings_json: "{}", last_run_at: null });
  }
  return results;
}
async function usedToday(tenantId: string, kind: AgentKind): Promise<number> {
  const r = await coreDb().prepare("SELECT COALESCE(SUM(actions),0) AS n FROM background_agent_runs WHERE tenant_id=? AND kind=? AND started_at>=?").bind(tenantId, kind, `${today()}T00:00:00.000Z`).first<{ n: number }>();
  return Number(r?.n || 0);
}
async function ownerEmail(tenantId: string): Promise<string> {
  const r = await coreDb().prepare("SELECT email FROM tenant_members WHERE tenant_id=? AND active=1 ORDER BY CASE role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END, created_at LIMIT 1").bind(tenantId).first<{ email: string }>();
  return r?.email || "agent";
}

type Report = { actions: number; summary: string; details: string[] };

async function followUp(tenantId: string, s: Record<string, number>, budget: number): Promise<Report> {
  const db = coreDb(); const cutoff = new Date(Date.now() - s.staleDays * 86_400_000).toISOString(); const owner = await ownerEmail(tenantId);
  const { results } = await db.prepare(`
    SELECT o.id AS deal_id, o.name AS deal_name, o.assigned_rep, o.primary_contact_id AS contact_id, c.full_name, o.updated_at
    FROM crm_opportunities o LEFT JOIN crm_contacts c ON c.id=o.primary_contact_id
    WHERE o.tenant_id=? AND o.stage NOT IN ('CLOSED WON','CLOSED LOST') AND o.updated_at<?
      AND NOT EXISTS (SELECT 1 FROM crm_activities a WHERE a.contact_id=o.primary_contact_id AND a.created_at>=?)
      AND NOT EXISTS (SELECT 1 FROM work_tasks t WHERE t.tenant_id=o.tenant_id AND t.status<>'DONE' AND (t.contact_id=o.primary_contact_id OR t.title LIKE '%' || o.name || '%') AND t.title LIKE 'Follow up%')
    ORDER BY o.value_cents DESC LIMIT ?`).bind(tenantId, cutoff, cutoff, budget).all<{ deal_id: string; deal_name: string; assigned_rep: string | null; contact_id: string | null; full_name: string | null; updated_at: string }>();
  const details: string[] = [];
  for (const d of results) {
    const who = d.assigned_rep || owner; const days = Math.round((Date.now() - new Date(d.updated_at).getTime()) / 86_400_000);
    await db.prepare("INSERT INTO work_tasks (id,title,details,status,priority,assignee,reporter,contact_id,due_at,estimated_minutes,tenant_id,created_at,updated_at) VALUES (?,?,?,'TODO','HIGH',?,?,?,?,15,?,?,?)")
      .bind(crypto.randomUUID(), `Follow up: ${d.deal_name}${d.full_name ? ` (${d.full_name})` : ""}`, `No activity for ${days} days. Created by the follow-up agent.`, who, "follow-up agent", d.contact_id, new Date(Date.now() + 86_400_000).toISOString(), tenantId, now(), now()).run();
    details.push(`Task for ${who}: ${d.deal_name} (${days} days quiet)`);
  }
  return { actions: details.length, summary: details.length ? `${details.length} follow-up task${details.length === 1 ? "" : "s"} created` : "Nothing has gone quiet", details };
}

async function bookingFiller(tenantId: string, _s: Record<string, number>, budget: number): Promise<Report> {
  const db = coreDb(); const settings = await companySettings(tenantId); const details: string[] = [];
  const { results } = await db.prepare("SELECT w.*, e.name AS event_name, e.duration_minutes, e.capacity FROM calendar_waitlist w JOIN calendar_event_types e ON e.id=w.event_type_id WHERE w.tenant_id=? AND w.status='WAITING' AND w.preferred_date IS NOT NULL AND w.preferred_date>=? ORDER BY w.created_at LIMIT ?").bind(tenantId, today(), budget * 3).all<Record<string, unknown>>();
  for (const w of results) {
    if (details.length >= budget) break;
    const time = String(w.preferred_time_start || "09:00"); const local = `${w.preferred_date}T${time.length === 5 ? time : "09:00"}:00`;
    const guess = new Date(local); if (Number.isNaN(guess.getTime())) continue;
    const offsetMin = (new Date(guess.toLocaleString("en-US", { timeZone: settings.timezone })).getTime() - guess.getTime()) / 60000;
    const starts = new Date(guess.getTime() - offsetMin * 60000); const ends = new Date(starts.getTime() + Number(w.duration_minutes || 30) * 60_000);
    if (starts.getTime() < Date.now()) continue;
    if (!withinBusinessHours(starts, settings)) continue;
    const taken = await db.prepare("SELECT COUNT(*) AS n FROM calendar_bookings WHERE event_type_id=? AND tenant_id=? AND status IN ('CONFIRMED','RESCHEDULED') AND starts_at<? AND ends_at>?").bind(String(w.event_type_id), tenantId, ends.toISOString(), starts.toISOString()).first<{ n: number }>();
    if (Number(taken?.n || 0) >= Number(w.capacity || 1)) continue;
    const contact = await db.prepare("SELECT id FROM crm_contacts WHERE tenant_id=? AND lower(email)=lower(?)").bind(tenantId, String(w.customer_email)).first<{ id: string }>();
    const bookingId = crypto.randomUUID();
    await db.prepare(`INSERT INTO calendar_bookings (id, event_type_id, contact_id, customer_name, customer_email, customer_phone, starts_at, ends_at, timezone, location_mode, status, notes, created_by, tenant_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,'PHONE','CONFIRMED',?,?,?,?,?)`)
      .bind(bookingId, String(w.event_type_id), contact?.id || null, String(w.customer_name), String(w.customer_email), w.customer_phone ? String(w.customer_phone) : null, starts.toISOString(), ends.toISOString(), settings.timezone, "Booked from the waitlist by the booking filler agent.", "booking filler agent", tenantId, now(), now()).run();
    await db.prepare("UPDATE calendar_waitlist SET status='BOOKED', booking_id=?, notified_at=?, updated_at=? WHERE id=?").bind(bookingId, now(), now(), String(w.id)).run();
    await emitAutomationEvent(tenantId, "BOOKING_CREATED", { contactId: contact?.id || "", bookingId, customerName: String(w.customer_name), customerEmail: String(w.customer_email), customerPhone: String(w.customer_phone || ""), startsAt: starts.toISOString(), eventName: String(w.event_name || ""), eventTypeId: String(w.event_type_id), trigger: "BOOKING_CREATED" }).catch(() => 0);
    details.push(`Booked ${w.customer_name} for ${w.event_name} on ${w.preferred_date} ${time}`);
  }
  return { actions: details.length, summary: details.length ? `${details.length} waitlist booking${details.length === 1 ? "" : "s"} made` : "No free slots matched the waitlist", details };
}

async function collections(tenantId: string, s: Record<string, number>, budget: number): Promise<Report> {
  const db = coreDb(); const details: string[] = []; const owner = await ownerEmail(tenantId);
  const company = (await db.prepare("SELECT name FROM tenants WHERE id=?").bind(tenantId).first<{ name: string }>())?.name || "Our team";
  const since = new Date(Date.now() - s.everyDays * 86_400_000).toISOString();
  const { results } = await db.prepare("SELECT * FROM crm_invoices WHERE tenant_id=? AND status='SENT' AND due_date IS NOT NULL AND due_date<? AND (last_reminded_at IS NULL OR last_reminded_at<?) ORDER BY due_date LIMIT ?").bind(tenantId, today(), since, budget).all<Record<string, unknown>>();
  for (const inv of results) {
    const count = Number(inv.reminder_count || 0) + 1; const amount = (Number(inv.amount_cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    const daysLate = Math.max(1, Math.round((Date.now() - new Date(String(inv.due_date)).getTime()) / 86_400_000));
    const link = inv.stripe_url ? `<p><a href="${String(inv.stripe_url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700">Pay ${amount} now</a></p>` : "";
    const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111"><p>Hi ${String(inv.client_name)},</p><p>A friendly reminder that invoice <b>${String(inv.invoice_number)}</b> for <b>${amount}</b> (${String(inv.description)}) was due on ${new Date(String(inv.due_date)).toLocaleDateString("en-US", { month: "long", day: "numeric" })} and is now ${daysLate} day${daysLate === 1 ? "" : "s"} past due.</p>${link}<p>If you've already sent payment, thank you, and please ignore this note. Questions? Just reply to this email.</p><p>${company}</p></div>`;
    const ok = await sendEmail({ tenantId, to: String(inv.client_email), subject: `${count > 1 ? "Second reminder: " : "Reminder: "}invoice ${String(inv.invoice_number)} (${amount}) is past due`, html });
    await db.prepare("UPDATE crm_invoices SET reminder_count=?, last_reminded_at=?, updated_at=? WHERE id=?").bind(count, now(), now(), String(inv.id)).run();
    details.push(`${ok ? "Reminded" : "Could not email"} ${inv.client_name} about ${inv.invoice_number} (${amount}, ${daysLate}d late)`);
    if (count >= 2) {
      const exists = await db.prepare("SELECT id FROM work_tasks WHERE tenant_id=? AND status<>'DONE' AND title LIKE ?").bind(tenantId, `Chase invoice ${String(inv.invoice_number)}%`).first();
      if (!exists) await db.prepare("INSERT INTO work_tasks (id,title,details,status,priority,assignee,reporter,due_at,estimated_minutes,tenant_id,created_at,updated_at) VALUES (?,?,?,'TODO','URGENT',?,?,?,10,?,?,?)").bind(crypto.randomUUID(), `Chase invoice ${String(inv.invoice_number)} · ${String(inv.client_name)}`, `${amount} is ${daysLate} days past due after ${count} reminders. Call them. Created by the collections agent.`, owner, "collections agent", now(), tenantId, now(), now()).run();
    }
    await emitAutomationEvent(tenantId, "INVOICE_OVERDUE", { invoiceId: String(inv.id), customerEmail: String(inv.client_email), customerName: String(inv.client_name), amountCents: Number(inv.amount_cents), trigger: "INVOICE_OVERDUE" }).catch(() => 0);
  }
  return { actions: details.length, summary: details.length ? `${details.length} overdue invoice${details.length === 1 ? "" : "s"} reminded` : "No overdue invoices need a reminder", details };
}

/** Runs one agent for one company now (cron or "Run now"). Records the run. */
export async function runAgent(tenantId: string, kind: AgentKind, trigger: "cron" | "manual" = "cron"): Promise<{ actions: number; summary: string; details: string[]; capped: boolean }> {
  const db = coreDb(); const rows = await agentsFor(tenantId); const row = rows.find((r) => r.kind === kind)!; const s = settingsOf(row);
  const used = await usedToday(tenantId, kind); const budget = Math.max(0, s.dailyCap - used);
  const startedAt = now(); let report: Report = { actions: 0, summary: "Daily cap reached", details: [] }; let capped = budget <= 0;
  if (!capped) {
    try { report = kind === "FOLLOW_UP" ? await followUp(tenantId, s, budget) : kind === "BOOKING_FILLER" ? await bookingFiller(tenantId, s, budget) : await collections(tenantId, s, budget); }
    catch (e) { report = { actions: 0, summary: `Failed: ${e instanceof Error ? e.message : "unknown error"}`, details: [] }; }
    capped = used + report.actions >= s.dailyCap;
  }
  await db.prepare("INSERT INTO background_agent_runs (id, tenant_id, kind, trigger, started_at, finished_at, actions, summary, details_json) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), tenantId, kind, trigger, startedAt, now(), report.actions, report.summary, JSON.stringify(report.details.slice(0, 200))).run();
  await db.prepare("UPDATE background_agents SET last_run_at=?, updated_at=? WHERE id=?").bind(now(), now(), row.id).run();
  return { ...report, capped };
}

/** Cron entry: every enabled agent in every company, at most once an hour each. */
export async function runBackgroundAgents(): Promise<{ companies: number; runs: number; actions: number }> {
  const db = coreDb(); const hourAgo = new Date(Date.now() - 55 * 60_000).toISOString();
  const { results } = await db.prepare("SELECT tenant_id, kind FROM background_agents WHERE enabled=1 AND (last_run_at IS NULL OR last_run_at<?)").bind(hourAgo).all<{ tenant_id: string; kind: AgentKind }>();
  let runs = 0, actions = 0; const companies = new Set<string>();
  for (const r of results) { try { const out = await runAgent(r.tenant_id, r.kind, "cron"); runs++; actions += out.actions; companies.add(r.tenant_id); } catch (e) { console.error("background_agent.failed", r, e); } }
  return { companies: companies.size, runs, actions };
}
