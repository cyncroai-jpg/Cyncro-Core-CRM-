/**
 * Growth Intelligence event architecture.
 *
 * Every acquisition-side thing that happens (a page view, a form step, a
 * tracked-link click, a CRM sync) is written here as one real gi_events
 * row. Attribution, journeys, and revenue intelligence are all just
 * different queries over this one table — nothing downstream keeps its
 * own parallel copy of "what happened."
 */
import { coreDb } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";

export type GrowthEventType =
  | "visitor.created"
  | "session.started"
  | "page.viewed"
  | "link.clicked"
  | "form.viewed"
  | "form.started"
  | "form.step_completed"
  | "form.abandoned"
  | "form.submitted"
  | "contact.identified"
  | "crm.contact_created"
  | "crm.contact_updated"
  | "crm.opportunity_created"
  | "opportunity.stage_changed"
  | "appointment.booked"
  | "ai.qualified"
  | "ai.agent_run"
  | "payment.completed"
  | "revenue.recorded";

export interface SessionAttribution {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  clickId?: string | null;
  referrer?: string | null;
  landingPageUrl?: string | null;
  device?: string | null;
}

function uid() {
  return crypto.randomUUID();
}

function guessSourceFromReferrer(referrer: string | null | undefined): { source: string; medium: string } {
  if (!referrer) return { source: "direct", medium: "none" };
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (/google\./.test(host)) return { source: "google", medium: "organic" };
    if (/facebook\.|instagram\./.test(host)) return { source: "meta", medium: "social" };
    if (/tiktok\./.test(host)) return { source: "tiktok", medium: "social" };
    if (/bing\./.test(host)) return { source: "bing", medium: "organic" };
    if (/linkedin\./.test(host)) return { source: "linkedin", medium: "social" };
    return { source: host, medium: "referral" };
  } catch {
    return { source: "direct", medium: "none" };
  }
}

/** Finds or creates the visitor + session for a request, using a first-party cookie. */
export async function resolveVisitorSession(
  visitorIdFromCookie: string | null,
  sessionIdFromCookie: string | null,
  attribution: SessionAttribution,
): Promise<{ visitorId: string; sessionId: string; isNewVisitor: boolean; isNewSession: boolean }> {
  await ensureGrowthSchema();
  const db = coreDb();
  const now = new Date().toISOString();
  let visitorId = visitorIdFromCookie;
  let isNewVisitor = false;
  if (visitorId) {
    const existing = await db.prepare("SELECT id FROM gi_visitors WHERE id=?").bind(visitorId).first();
    if (!existing) visitorId = null;
  }
  if (!visitorId) {
    visitorId = uid();
    isNewVisitor = true;
    await db.prepare("INSERT INTO gi_visitors (id, first_seen_at, last_seen_at, created_at) VALUES (?,?,?,?)")
      .bind(visitorId, now, now, now).run();
    await recordEvent({ visitorId, sessionId: null, eventType: "visitor.created", source: attribution.source, campaign: attribution.campaign });
  } else {
    await db.prepare("UPDATE gi_visitors SET last_seen_at=? WHERE id=?").bind(now, visitorId).run();
  }

  let sessionId = sessionIdFromCookie;
  let isNewSession = false;
  if (sessionId) {
    const existing = await db.prepare("SELECT id FROM gi_sessions WHERE id=? AND visitor_id=?").bind(sessionId, visitorId).first();
    if (!existing) sessionId = null;
  }
  if (!sessionId) {
    sessionId = uid();
    isNewSession = true;
    const guessed = !attribution.source ? guessSourceFromReferrer(attribution.referrer) : null;
    const source = attribution.utmSource || attribution.source || guessed?.source || "direct";
    const medium = attribution.utmMedium || attribution.medium || guessed?.medium || "none";
    await db.prepare(`INSERT INTO gi_sessions
      (id, visitor_id, source, medium, campaign, utm_source, utm_medium, utm_campaign, utm_content, utm_term, click_id, referrer, landing_page_url, device, started_at, last_event_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(sessionId, visitorId, source, medium, attribution.utmCampaign || attribution.campaign || null,
        attribution.utmSource || null, attribution.utmMedium || null, attribution.utmCampaign || null, attribution.utmContent || null, attribution.utmTerm || null,
        attribution.clickId || null, attribution.referrer || null, attribution.landingPageUrl || null, attribution.device || "desktop", now, now).run();
    await recordEvent({ visitorId, sessionId, eventType: "session.started", source, campaign: attribution.utmCampaign || attribution.campaign || null });
  } else {
    await db.prepare("UPDATE gi_sessions SET last_event_at=? WHERE id=?").bind(now, sessionId).run();
  }
  return { visitorId, sessionId, isNewVisitor, isNewSession };
}

export interface RecordEventInput {
  visitorId: string;
  sessionId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  eventType: GrowthEventType | string;
  eventValueCents?: number;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  formId?: string | null;
  landingPageId?: string | null;
  linkId?: string | null;
  agentId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordEvent(input: RecordEventInput): Promise<string> {
  await ensureGrowthSchema();
  const db = coreDb();
  const id = uid();
  const now = new Date().toISOString();
  // Denormalize source/campaign from the visitor's session when the caller doesn't supply one,
  // so attribution queries never need a join against gi_sessions.
  let source = input.source ?? null;
  let medium = input.medium ?? null;
  let campaign = input.campaign ?? null;
  if ((!source || !campaign) && input.sessionId) {
    const session = await db.prepare("SELECT source, medium, campaign FROM gi_sessions WHERE id=?").bind(input.sessionId).first<{ source: string; medium: string; campaign: string | null }>();
    if (session) {
      source = source ?? session.source;
      medium = medium ?? session.medium;
      campaign = campaign ?? session.campaign;
    }
  }
  await db.prepare(`INSERT INTO gi_events
    (id, visitor_id, session_id, contact_id, opportunity_id, event_type, event_value_cents, source, medium, campaign, form_id, landing_page_id, link_id, agent_id, metadata_json, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, input.visitorId, input.sessionId || null, input.contactId || null, input.opportunityId || null,
      input.eventType, Math.max(0, Math.round(input.eventValueCents || 0)), source, medium, campaign,
      input.formId || null, input.landingPageId || null, input.linkId || null, input.agentId || null,
      JSON.stringify(input.metadata || {}), now).run();
  return id;
}

/** Once a visitor is identified as a CRM contact, back-fills contact_id onto their whole event history. */
export async function attachVisitorToContact(visitorId: string, contactId: string, method: "DETERMINISTIC" | "PROBABILISTIC", evidence: Record<string, unknown>) {
  await ensureGrowthSchema();
  const db = coreDb();
  const now = new Date().toISOString();
  await db.prepare("UPDATE gi_visitors SET contact_id=? WHERE id=?").bind(contactId, visitorId).run();
  await db.prepare("UPDATE gi_events SET contact_id=? WHERE visitor_id=? AND contact_id IS NULL").bind(contactId, visitorId).run();
  const existing = await db.prepare("SELECT id FROM gi_identity_links WHERE visitor_id=? AND contact_id=? AND unmerged_at IS NULL").bind(visitorId, contactId).first();
  if (!existing) {
    await db.prepare("INSERT INTO gi_identity_links (id, visitor_id, contact_id, method, evidence_json, created_at) VALUES (?,?,?,?,?,?)")
      .bind(uid(), visitorId, contactId, method, JSON.stringify(evidence), now).run();
  }
  await recordEvent({ visitorId, contactId, eventType: "contact.identified", metadata: { method } });
}
