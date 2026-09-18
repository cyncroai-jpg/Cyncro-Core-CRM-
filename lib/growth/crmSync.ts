/**
 * Growth Intelligence → Cyncro Core sync layer.
 *
 * This is the ONLY place Growth Intelligence is allowed to touch
 * crm_contacts / crm_opportunities. It never redefines those tables and
 * never becomes a parallel system of record — it finds-or-creates the
 * real CRM contact, writes acquisition context onto it (original vs.
 * latest source, never overwriting original), and optionally creates a
 * real opportunity in the real pipeline. Everything here is idempotent:
 * the same visitor submitting twice updates one contact, never creates two.
 */
import { coreDb, cleanText, normalizeEmail, normalizePhone, requestUser } from "@/lib/core/db";
import { runAutomations } from "@/lib/core/automations";
import { attachVisitorToContact } from "@/lib/growth/events";

function uid() {
  return crypto.randomUUID();
}

export interface ContactIdentity {
  email?: string | null;
  phone?: string | null;
}

export async function findContactByIdentity(identity: ContactIdentity): Promise<Record<string, unknown> | null> {
  const db = coreDb();
  const email = normalizeEmail(identity.email);
  if (email) {
    const byEmail = await db.prepare("SELECT * FROM crm_contacts WHERE lower(email)=?").bind(email).first();
    if (byEmail) return byEmail;
  }
  const phoneDigits = normalizePhone(identity.phone);
  if (phoneDigits) {
    const byPhone = await db
      .prepare("SELECT * FROM crm_contacts WHERE replace(replace(replace(replace(replace(phone,'+',''),'-',''),' ',''),'(',''),')','') = ? LIMIT 1")
      .bind(phoneDigits)
      .first();
    if (byPhone) return byPhone;
  }
  return null;
}

export interface SourceAttribution {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  landingPage?: string | null;
}

export interface SyncContactInput {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  source?: string;
  visitorId?: string | null;
  attribution?: SourceAttribution | null;
  formId?: string | null;
  createdBy?: string;
  tags?: string[];
}

export interface SyncContactResult {
  contact: Record<string, unknown>;
  created: boolean;
}

/** Finds-or-creates a CRM contact for a form respondent, wiring in real Growth Intelligence attribution. */
export async function syncContact(input: SyncContactInput): Promise<SyncContactResult> {
  const db = coreDb();
  const now = new Date().toISOString();
  const email = normalizeEmail(input.email);
  const phone = cleanText(input.phone, 40) || null;

  const existing = await findContactByIdentity({ email, phone });
  if (existing) {
    const id = String(existing.id);
    const fields: string[] = [];
    const values: unknown[] = [];
    if (input.attribution) {
      fields.push("gi_latest_source=?", "gi_latest_medium=?", "gi_latest_campaign=?", "gi_latest_landing_page=?", "gi_latest_session_at=?");
      values.push(input.attribution.source || null, input.attribution.medium || null, input.attribution.campaign || null, input.attribution.landingPage || null, now);
    }
    if (input.visitorId) {
      fields.push("gi_visitor_id=?");
      values.push(input.visitorId);
      await attachVisitorToContact(input.visitorId, id, "DETERMINISTIC", { matchedOn: email ? "email" : "phone" });
    }
    if (input.tags?.length) {
      const existingTags: string[] = JSON.parse(String(existing.gi_tags || "[]"));
      const merged = Array.from(new Set([...existingTags, ...input.tags]));
      fields.push("gi_tags=?");
      values.push(JSON.stringify(merged));
    }
    if (fields.length) {
      fields.push("updated_at=?");
      values.push(now, id);
      await db.prepare(`UPDATE crm_contacts SET ${fields.join(", ")} WHERE id=?`).bind(...values).run();
    }
    const refreshed = await db.prepare("SELECT * FROM crm_contacts WHERE id=?").bind(id).first<Record<string, unknown>>();
    return { contact: refreshed as Record<string, unknown>, created: false };
  }

  const id = uid();
  const company = `${input.fullName} Account`;
  const existingAccount = await db.prepare("SELECT id FROM crm_accounts WHERE lower(name)=lower(?) LIMIT 1").bind(company).first<{ id: string }>();
  const accountId = existingAccount?.id || uid();
  if (!existingAccount) {
    await db.prepare(`INSERT INTO crm_accounts (id, name, owner_email, source, status, created_at, updated_at) VALUES (?,?,?,?,'ACTIVE',?,?)`)
      .bind(accountId, company, input.createdBy || "growth-intelligence", input.source || "GROWTH_INTELLIGENCE", now, now).run();
  }
  await db.prepare(`INSERT INTO crm_contacts
    (id, account_id, full_name, email, phone, lifecycle, assigned_rep, source, created_at, updated_at,
     gi_visitor_id, gi_original_source, gi_original_medium, gi_original_campaign, gi_original_landing_page, gi_original_form_id, gi_first_touch_at,
     gi_latest_source, gi_latest_medium, gi_latest_campaign, gi_latest_landing_page, gi_latest_session_at, gi_tags)
    VALUES (?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?,?)`)
    .bind(
      id, accountId, input.fullName, email, phone, "LEAD", input.createdBy || null, input.source || "GROWTH_INTELLIGENCE", now, now,
      input.visitorId || null,
      input.attribution?.source || null, input.attribution?.medium || null, input.attribution?.campaign || null, input.attribution?.landingPage || null, input.formId || null, now,
      input.attribution?.source || null, input.attribution?.medium || null, input.attribution?.campaign || null, input.attribution?.landingPage || null, now,
      JSON.stringify(input.tags || []),
    ).run();
  if (input.visitorId) await attachVisitorToContact(input.visitorId, id, "DETERMINISTIC", { matchedOn: "new_contact" });
  const contact = await db.prepare("SELECT * FROM crm_contacts WHERE id=?").bind(id).first<Record<string, unknown>>();
  return { contact: contact as Record<string, unknown>, created: true };
}

export interface SyncOpportunityInput {
  contactId: string;
  accountId: string;
  name: string;
  pipelineId?: string | null;
  stage?: string | null;
  assignedRep?: string | null;
  source?: string;
  campaign?: string | null;
  formId?: string | null;
  valueCents?: number;
}

/** Creates a real opportunity in the real default pipeline (or the one specified), same logic as the CRM contacts endpoint uses. */
export async function createOpportunityForContact(input: SyncOpportunityInput): Promise<Record<string, unknown>> {
  const db = coreDb();
  const now = new Date().toISOString();
  let pipeline = input.pipelineId
    ? await db.prepare("SELECT id FROM crm_pipelines WHERE id=?").bind(input.pipelineId).first<{ id: string }>()
    : await db.prepare("SELECT id FROM crm_pipelines WHERE active=1 ORDER BY is_default DESC, created_at LIMIT 1").first<{ id: string }>();
  if (!pipeline) {
    const pipelineId = uid();
    await db.prepare("INSERT INTO crm_pipelines (id,name,description,is_default,active,created_at,updated_at) VALUES (?,'Sales Pipeline','Primary revenue pipeline',1,1,?,?)").bind(pipelineId, now, now).run();
    const defaults = [["NEW LEAD", "#6B7280", 10], ["QUALIFIED", "#8B5CF6", 25], ["DISCOVERY", "#3B82F6", 40], ["PROPOSAL", "#F59E0B", 65], ["CLOSED WON", "#10B981", 100], ["CLOSED LOST", "#374151", 0]] as const;
    await db.batch(defaults.map((stage, position) => db.prepare(`INSERT INTO crm_pipeline_stages (id,pipeline_id,name,color,position,probability,is_won,is_lost,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(uid(), pipelineId, stage[0], stage[1], position, stage[2], stage[0] === "CLOSED WON" ? 1 : 0, stage[0] === "CLOSED LOST" ? 1 : 0, now, now)));
    pipeline = { id: pipelineId };
  }
  const stage = input.stage || (await db.prepare("SELECT name FROM crm_pipeline_stages WHERE pipeline_id=? ORDER BY position LIMIT 1").bind(pipeline.id).first<{ name: string }>())?.name || "NEW LEAD";
  const id = uid();
  await db.prepare(`INSERT INTO crm_opportunities
    (id, account_id, primary_contact_id, pipeline_id, name, stage, value_cents, probability, assigned_rep, commission_rate_bps, commission_status, payment_status, collected_cents, residual_rate_bps, residual_months, source, created_at, updated_at, gi_source, gi_campaign, gi_form_id)
    VALUES (?,?,?,?,?,?,?,10,?,2000,'PENDING','UNPAID',0,0,0,?,?,?,?,?,?)`)
    .bind(id, input.accountId, input.contactId, pipeline.id, input.name, stage, Math.max(0, Math.round(input.valueCents || 0)),
      input.assignedRep || null, input.source || "GROWTH_INTELLIGENCE", now, now, input.source || null, input.campaign || null, input.formId || null).run();
  await runAutomations(new Request("https://internal/growth-intelligence"), "CONTACT_CREATED", { contactId: input.contactId, accountId: input.accountId, opportunityId: id, source: input.source || "GROWTH_INTELLIGENCE" });
  return (await db.prepare("SELECT * FROM crm_opportunities WHERE id=?").bind(id).first()) as Record<string, unknown>;
}

export async function addActivityNote(contactId: string, title: string, details: string, createdBy?: string) {
  const db = coreDb();
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO crm_activities (id, contact_id, activity_type, title, details, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(uid(), contactId, "NOTE", title, details, "COMPLETED", createdBy || "growth-intelligence", now, now).run();
}

export async function createFollowUpTask(params: { contactId: string; title: string; details?: string; assignee?: string | null; dueAt?: string | null }) {
  const db = coreDb();
  const now = new Date().toISOString();
  const id = uid();
  await db.prepare(`INSERT INTO work_tasks (id, title, details, status, priority, assignee, reporter, contact_id, due_at, created_at, updated_at) VALUES (?,?,?,'TODO','MEDIUM',?,?,?,?,?,?)`)
    .bind(id, params.title, params.details || null, params.assignee || null, "growth-intelligence", params.contactId, params.dueAt || null, now, now).run();
  return id;
}
