/**
 * Dashboard stats for Automations, Forms and Studio landing pages.
 * Everything here is computed from real rows in D1 for one tenant; nothing is
 * estimated. Day series always cover the last `days` days (oldest first) so the
 * charts have a fixed, comparable axis.
 */
import { coreDb } from "@/lib/core/db";

export type DayPoint = { day: string; [k: string]: number | string };

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
export function dayAxis(days: number): string[] {
  const out: string[] = [];
  const t = new Date(); t.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) out.push(dayKey(new Date(t.getTime() - i * 86_400_000)));
  return out;
}
function sinceIso(days: number) { const t = new Date(); t.setUTCHours(0, 0, 0, 0); return new Date(t.getTime() - (days - 1) * 86_400_000).toISOString(); }
function series(axis: string[], rows: { day: string; [k: string]: unknown }[], keys: string[]): DayPoint[] {
  const byDay = new Map(rows.map((r) => [String(r.day), r]));
  return axis.map((day) => { const r = byDay.get(day) || {}; const p: DayPoint = { day }; for (const k of keys) p[k] = Number((r as Record<string, unknown>)[k] || 0); return p; });
}
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

export async function automationStats(tenantId: string, days = 30) {
  const db = coreDb(); const axis = dayAxis(days); const since = sinceIso(days);
  const [perDay, perWorkflow, kinds, failures, upcoming, triggers, totals, prev] = await Promise.all([
    db.prepare(`SELECT substr(started_at,1,10) AS day,
        COUNT(*) AS enrolled,
        SUM(CASE WHEN status='DONE' THEN 1 ELSE 0 END) AS done,
        SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) AS failed
      FROM automation_enrollments WHERE tenant_id=? AND started_at>=? GROUP BY day`).bind(tenantId, since).all<{ day: string; enrolled: number; done: number; failed: number }>(),
    db.prepare(`SELECT w.id, w.name, w.trigger, w.active, w.last_run_at,
        (SELECT COUNT(*) FROM automation_enrollments e WHERE e.workflow_id=w.id) AS enrolled,
        (SELECT COUNT(*) FROM automation_enrollments e WHERE e.workflow_id=w.id AND e.status='DONE') AS done,
        (SELECT COUNT(*) FROM automation_enrollments e WHERE e.workflow_id=w.id AND e.status='FAILED') AS failed,
        (SELECT COUNT(*) FROM automation_enrollments e WHERE e.workflow_id=w.id AND e.status='ACTIVE') AS active_now,
        (SELECT COUNT(*) FROM automation_enrollments e WHERE e.workflow_id=w.id AND e.status='STOPPED') AS stopped,
        (SELECT COUNT(*) FROM automation_events ev WHERE ev.workflow_id=w.id AND ev.kind='SEND_EMAIL') AS emails,
        (SELECT COUNT(*) FROM automation_events ev WHERE ev.workflow_id=w.id AND ev.kind='SEND_SMS') AS texts,
        (SELECT COUNT(*) FROM automation_enrollments e WHERE e.workflow_id=w.id AND e.started_at>=?) AS enrolled_period
      FROM automation_workflows w WHERE w.tenant_id=? ORDER BY enrolled DESC, w.updated_at DESC`).bind(since, tenantId).all<Record<string, unknown>>(),
    db.prepare("SELECT kind, COUNT(*) AS n FROM automation_events WHERE tenant_id=? AND created_at>=? GROUP BY kind ORDER BY n DESC").bind(tenantId, since).all<{ kind: string; n: number }>(),
    db.prepare("SELECT last_error AS reason, COUNT(*) AS n FROM automation_enrollments WHERE tenant_id=? AND status='FAILED' AND last_error IS NOT NULL GROUP BY last_error ORDER BY n DESC LIMIT 6").bind(tenantId).all<{ reason: string; n: number }>(),
    db.prepare(`SELECT e.id, e.next_run_at, e.step_index, w.name AS workflow_name, c.full_name AS contact_name
      FROM automation_enrollments e JOIN automation_workflows w ON w.id=e.workflow_id LEFT JOIN crm_contacts c ON c.id=e.contact_id
      WHERE e.tenant_id=? AND e.status='ACTIVE' AND e.next_run_at IS NOT NULL ORDER BY e.next_run_at ASC LIMIT 12`).bind(tenantId).all<Record<string, unknown>>(),
    db.prepare("SELECT w.trigger, COUNT(e.id) AS n FROM automation_workflows w LEFT JOIN automation_enrollments e ON e.workflow_id=w.id AND e.started_at>=? WHERE w.tenant_id=? GROUP BY w.trigger ORDER BY n DESC").bind(since, tenantId).all<{ trigger: string; n: number }>(),
    db.prepare(`SELECT
        (SELECT COUNT(*) FROM automation_workflows WHERE tenant_id=?) AS workflows,
        (SELECT COUNT(*) FROM automation_workflows WHERE tenant_id=? AND active=1) AS active_workflows,
        (SELECT COUNT(*) FROM automation_enrollments WHERE tenant_id=?) AS enrolled_all,
        (SELECT COUNT(*) FROM automation_enrollments WHERE tenant_id=? AND status='ACTIVE') AS running,
        (SELECT COUNT(*) FROM automation_enrollments WHERE tenant_id=? AND status='DONE') AS done_all,
        (SELECT COUNT(*) FROM automation_enrollments WHERE tenant_id=? AND status='FAILED') AS failed_all,
        (SELECT COUNT(*) FROM automation_events WHERE tenant_id=? AND kind='SEND_EMAIL') AS emails_all,
        (SELECT COUNT(*) FROM automation_events WHERE tenant_id=? AND kind='SEND_SMS') AS texts_all,
        (SELECT COUNT(*) FROM automation_events WHERE tenant_id=? AND kind='CREATE_TASK') AS tasks_all,
        (SELECT COUNT(*) FROM automation_enrollments WHERE tenant_id=? AND started_at>=?) AS enrolled_period`)
      .bind(tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, since).first<Record<string, number>>(),
    db.prepare("SELECT COUNT(*) AS n FROM automation_enrollments WHERE tenant_id=? AND started_at>=? AND started_at<?").bind(tenantId, sinceIso(days * 2), since).first<{ n: number }>(),
  ]);
  const t = totals || {};
  return {
    days, axis,
    perDay: series(axis, perDay.results, ["enrolled", "done", "failed"]),
    workflows: perWorkflow.results.map((w) => ({ ...w, success_rate: pct(Number(w.done), Number(w.done) + Number(w.failed) + Number(w.stopped)) })),
    kinds: kinds.results, failures: failures.results, upcoming: upcoming.results, triggers: triggers.results,
    totals: { ...t, success_rate: pct(Number(t.done_all || 0), Number(t.done_all || 0) + Number(t.failed_all || 0)), enrolled_prev: Number(prev?.n || 0) },
  };
}

export async function formStats(tenantId: string, days = 30) {
  const db = coreDb(); const axis = dayAxis(days); const since = sinceIso(days);
  const [perDay, perForm, recent, totals, prev, modes] = await Promise.all([
    db.prepare(`SELECT substr(s.submitted_at,1,10) AS day, COUNT(*) AS submissions, SUM(CASE WHEN s.signature_name IS NOT NULL THEN 1 ELSE 0 END) AS signed
      FROM crm_form_submissions s JOIN crm_forms f ON f.id=s.form_id WHERE f.tenant_id=? AND s.submitted_at>=? GROUP BY day`).bind(tenantId, since).all<{ day: string; submissions: number; signed: number }>(),
    db.prepare(`SELECT f.id, f.title, f.status, f.requires_signature, f.settings_json, f.updated_at,
        (SELECT COUNT(*) FROM crm_form_submissions s WHERE s.form_id=f.id) AS submissions,
        (SELECT COUNT(*) FROM crm_form_submissions s WHERE s.form_id=f.id AND s.submitted_at>=?) AS submissions_period,
        (SELECT COUNT(*) FROM crm_form_submissions s WHERE s.form_id=f.id AND s.signature_name IS NOT NULL) AS signed,
        (SELECT COUNT(*) FROM crm_form_files x JOIN crm_form_submissions s ON s.id=x.submission_id WHERE s.form_id=f.id) AS files,
        (SELECT COUNT(DISTINCT s.respondent_email) FROM crm_form_submissions s WHERE s.form_id=f.id) AS people,
        (SELECT MAX(s.submitted_at) FROM crm_form_submissions s WHERE s.form_id=f.id) AS last_at,
        (SELECT COUNT(*) FROM automation_enrollments e WHERE e.tenant_id=f.tenant_id AND e.context LIKE '%"formId":"' || f.id || '"%') AS automations_started
      FROM crm_forms f WHERE f.tenant_id=? ORDER BY submissions DESC, f.updated_at DESC`).bind(since, tenantId).all<Record<string, unknown>>(),
    db.prepare(`SELECT s.id, s.respondent_name, s.respondent_email, s.submitted_at, s.signature_name, f.title AS form_title, s.contact_id
      FROM crm_form_submissions s JOIN crm_forms f ON f.id=s.form_id WHERE f.tenant_id=? ORDER BY s.submitted_at DESC LIMIT 10`).bind(tenantId).all<Record<string, unknown>>(),
    db.prepare(`SELECT
        (SELECT COUNT(*) FROM crm_forms WHERE tenant_id=?) AS forms,
        (SELECT COUNT(*) FROM crm_forms WHERE tenant_id=? AND status='PUBLISHED') AS live,
        (SELECT COUNT(*) FROM crm_form_submissions s JOIN crm_forms f ON f.id=s.form_id WHERE f.tenant_id=?) AS submissions,
        (SELECT COUNT(*) FROM crm_form_submissions s JOIN crm_forms f ON f.id=s.form_id WHERE f.tenant_id=? AND s.submitted_at>=?) AS submissions_period,
        (SELECT COUNT(*) FROM crm_form_submissions s JOIN crm_forms f ON f.id=s.form_id WHERE f.tenant_id=? AND s.signature_name IS NOT NULL) AS signed,
        (SELECT COUNT(*) FROM crm_form_files x JOIN crm_form_submissions s ON s.id=x.submission_id JOIN crm_forms f ON f.id=s.form_id WHERE f.tenant_id=?) AS files,
        (SELECT COUNT(*) FROM crm_contacts WHERE tenant_id=? AND source='FORM') AS contacts_created`)
      .bind(tenantId, tenantId, tenantId, tenantId, since, tenantId, tenantId, tenantId).first<Record<string, number>>(),
    db.prepare("SELECT COUNT(*) AS n FROM crm_form_submissions s JOIN crm_forms f ON f.id=s.form_id WHERE f.tenant_id=? AND s.submitted_at>=? AND s.submitted_at<?").bind(tenantId, sinceIso(days * 2), since).first<{ n: number }>(),
    db.prepare("SELECT settings_json FROM crm_forms WHERE tenant_id=?").bind(tenantId).all<{ settings_json: string | null }>(),
  ]);
  let book = 0, message = 0, tagged = 0, assigned = 0;
  for (const r of modes.results) { let s: Record<string, unknown> = {}; try { s = JSON.parse(r.settings_json || "{}"); } catch {} if (s.afterSubmit === "book") book++; else message++; if (String(s.tags || "").trim()) tagged++; if (String(s.assignTo || "").trim()) assigned++; }
  const t = totals || {};
  return {
    days, axis,
    perDay: series(axis, perDay.results, ["submissions", "signed"]),
    forms: perForm.results.map((f) => { let s: Record<string, unknown> = {}; try { s = JSON.parse(String(f.settings_json || "{}")); } catch {} return { ...f, settings_json: undefined, after_submit: s.afterSubmit === "book" ? "book" : "message", booking_event: String(s.bookingEvent || ""), tags: String(s.tags || ""), assign_to: String(s.assignTo || "") }; }),
    recent: recent.results,
    totals: { ...t, sign_rate: pct(Number(t.signed || 0), Number(t.submissions || 0)), submissions_prev: Number(prev?.n || 0), handoff: { book, message, tagged, assigned } },
  };
}

export async function studioStats(tenantId: string, days = 30) {
  const db = coreDb(); const axis = dayAxis(days); const since = sinceIso(days);
  const [viewsDay, subsDay, perPage, referrers, recent, totals, prev] = await Promise.all([
    db.prepare("SELECT substr(created_at,1,10) AS day, COUNT(*) AS views FROM studio_page_views WHERE tenant_id=? AND created_at>=? GROUP BY day").bind(tenantId, since).all<{ day: string; views: number }>(),
    db.prepare("SELECT substr(created_at,1,10) AS day, COUNT(*) AS submissions FROM studio_submissions WHERE tenant_id=? AND created_at>=? GROUP BY day").bind(tenantId, since).all<{ day: string; submissions: number }>(),
    db.prepare(`SELECT p.id, p.slug, p.title, p.status, p.updated_at,
        (SELECT COUNT(*) FROM studio_page_views v WHERE v.page_id=p.id) AS views,
        (SELECT COUNT(*) FROM studio_page_views v WHERE v.page_id=p.id AND v.created_at>=?) AS views_period,
        (SELECT COUNT(*) FROM studio_submissions s WHERE s.page_id=p.id) AS submissions,
        (SELECT COUNT(*) FROM studio_submissions s WHERE s.page_id=p.id AND s.created_at>=?) AS submissions_period,
        (SELECT COUNT(DISTINCT s.contact_id) FROM studio_submissions s WHERE s.page_id=p.id AND s.contact_id IS NOT NULL) AS contacts,
        (SELECT COUNT(*) FROM crm_opportunities o WHERE o.primary_contact_id IN (SELECT s.contact_id FROM studio_submissions s WHERE s.page_id=p.id) AND o.source='STUDIO') AS deals,
        (SELECT COUNT(*) FROM crm_opportunities o WHERE o.primary_contact_id IN (SELECT s.contact_id FROM studio_submissions s WHERE s.page_id=p.id) AND o.stage='CLOSED WON') AS won,
        (SELECT COALESCE(SUM(o.value_cents),0) FROM crm_opportunities o WHERE o.primary_contact_id IN (SELECT s.contact_id FROM studio_submissions s WHERE s.page_id=p.id)) AS pipeline_cents,
        (SELECT COUNT(*) FROM calendar_bookings b WHERE b.tenant_id=p.tenant_id AND b.contact_id IN (SELECT s.contact_id FROM studio_submissions s WHERE s.page_id=p.id)) AS bookings,
        (SELECT MAX(s.created_at) FROM studio_submissions s WHERE s.page_id=p.id) AS last_at
      FROM studio_pages p WHERE p.tenant_id=? ORDER BY submissions DESC, views DESC, p.updated_at DESC`).bind(since, since, tenantId).all<Record<string, unknown>>(),
    db.prepare("SELECT COALESCE(NULLIF(referrer,''),'direct') AS referrer, COUNT(*) AS n FROM studio_page_views WHERE tenant_id=? AND created_at>=? GROUP BY referrer ORDER BY n DESC LIMIT 8").bind(tenantId, since).all<{ referrer: string; n: number }>(),
    db.prepare(`SELECT s.id, s.created_at, s.answers_json, p.title AS page_title, p.slug, c.full_name AS contact_name, s.contact_id
      FROM studio_submissions s JOIN studio_pages p ON p.id=s.page_id LEFT JOIN crm_contacts c ON c.id=s.contact_id WHERE s.tenant_id=? ORDER BY s.created_at DESC LIMIT 10`).bind(tenantId).all<Record<string, unknown>>(),
    db.prepare(`SELECT
        (SELECT COUNT(*) FROM studio_pages WHERE tenant_id=?) AS pages,
        (SELECT COUNT(*) FROM studio_pages WHERE tenant_id=? AND status='PUBLISHED') AS live,
        (SELECT COUNT(*) FROM studio_page_views WHERE tenant_id=?) AS views,
        (SELECT COUNT(*) FROM studio_page_views WHERE tenant_id=? AND created_at>=?) AS views_period,
        (SELECT COUNT(*) FROM studio_submissions WHERE tenant_id=?) AS submissions,
        (SELECT COUNT(*) FROM studio_submissions WHERE tenant_id=? AND created_at>=?) AS submissions_period,
        (SELECT COUNT(*) FROM crm_contacts WHERE tenant_id=? AND source='STUDIO') AS contacts_created,
        (SELECT COUNT(*) FROM crm_opportunities WHERE tenant_id=? AND source='STUDIO') AS deals,
        (SELECT COALESCE(SUM(value_cents),0) FROM crm_opportunities WHERE tenant_id=? AND source='STUDIO') AS pipeline_cents`)
      .bind(tenantId, tenantId, tenantId, tenantId, since, tenantId, tenantId, since, tenantId, tenantId, tenantId).first<Record<string, number>>(),
    db.prepare("SELECT COUNT(*) AS n FROM studio_submissions WHERE tenant_id=? AND created_at>=? AND created_at<?").bind(tenantId, sinceIso(days * 2), since).first<{ n: number }>(),
  ]);
  const t = totals || {};
  const byDay = new Map<string, DayPoint>(axis.map((d) => [d, { day: d, views: 0, submissions: 0 }]));
  for (const r of viewsDay.results) { const p = byDay.get(r.day); if (p) p.views = Number(r.views); }
  for (const r of subsDay.results) { const p = byDay.get(r.day); if (p) p.submissions = Number(r.submissions); }
  return {
    days, axis, perDay: [...byDay.values()],
    pages: perPage.results.map((p) => ({ ...p, conversion: pct(Number(p.submissions), Number(p.views)) })),
    referrers: referrers.results, recent: recent.results,
    totals: { ...t, conversion: pct(Number(t.submissions || 0), Number(t.views || 0)), submissions_prev: Number(prev?.n || 0) },
  };
}
