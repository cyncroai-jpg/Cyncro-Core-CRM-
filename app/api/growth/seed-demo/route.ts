/**
 * One-click demo data for Growth Intelligence — same pattern used to seed
 * Automotive/Dispatch/Dispute/Apex Funds earlier this project: real rows
 * in the real tables (real gi_events, real crm_contacts/crm_opportunities
 * via the same crmSync layer live traffic uses), backdated over the last
 * 60 days so every dashboard, funnel, and attribution report has
 * something real to show. Guarded so re-clicking can't duplicate data.
 */
import { coreDb, hasCrmAction, requestUser } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";
import { syncContact, createOpportunityForContact } from "@/lib/growth/crmSync";
import { recordEvent } from "@/lib/growth/events";

function uid() {
  return crypto.randomUUID();
}
function daysAgo(n: number, hourOffset = 0) {
  return new Date(Date.now() - n * 86_400_000 + hourOffset * 3_600_000).toISOString();
}
function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[rand(0, arr.length - 1)];
}

const NAMES = ["Sarah Jensen", "Marcus Webb", "Priya Nair", "Diego Alvarez", "Kayla Brooks", "Owen Park", "Renee Foster", "Jamal Carter", "Lena Schmidt", "Tyrese Nolan", "Anya Volkov", "Caleb Ruiz", "Ines Moreau", "Grant Ellison", "Maya Okafor", "Dev Patel", "Hannah Cross", "Felix Bauer", "Sofia Reyes", "Noah Whitfield", "Chloe Bennett", "Marcus Lin", "Abby Fuentes", "Ryan Okoro"];
const SOURCES = [
  { source: "meta", medium: "paid-social", campaign: "roofing-fall-promo" },
  { source: "google", medium: "cpc", campaign: "roofing-search" },
  { source: "google", medium: "organic", campaign: null },
  { source: "direct", medium: "none", campaign: null },
  { source: "referral-partner", medium: "referral", campaign: "partner-program" },
];

export async function POST(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "create"))) return Response.json({ error: "Create permission is required." }, { status: 403 });
    const db = coreDb();
    const createdBy = requestUser(request);

    const existing = await db.prepare("SELECT id FROM gi_forms WHERE name = ?").bind("Free Roof Inspection").first();
    if (existing) return Response.json({ seeded: false, note: "Demo data already exists." });

    const now = new Date().toISOString();

    // ---- Form ----
    const formId = uid();
    const formToken = uid().replace(/-/g, "").slice(0, 24);
    const steps = [{
      id: uid(), title: "Get your free inspection", fields: [
        { id: "f_name", label: "Full name", type: "TEXT", required: true, options: [], role: "NAME" },
        { id: "f_email", label: "Email", type: "EMAIL", required: true, options: [], role: "EMAIL" },
        { id: "f_phone", label: "Phone", type: "PHONE", required: false, options: [], role: "PHONE" },
        { id: "f_roof", label: "Roof age", type: "DROPDOWN", required: true, options: ["0-5 years", "6-15 years", "16+ years", "Not sure"], role: null },
      ],
    }];
    await db.prepare(`INSERT INTO gi_forms (id, name, type, status, public_token, steps_json, style_json, thank_you_json, sync_config_json, views, starts, submissions, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(formId, "Free Roof Inspection", "LEAD", "PUBLISHED", formToken, JSON.stringify(steps), "{}",
        JSON.stringify({ message: "Thanks — a roofing specialist will call within 24 hours." }),
        JSON.stringify({ createOpportunity: true }), 0, 0, 0, createdBy, daysAgo(58), daysAgo(58)).run();

    // ---- Landing page ----
    const pageId = uid();
    await db.prepare(`INSERT INTO gi_landing_pages (id, name, slug, status, sections_json, form_id, campaign_id, seo_json, conversion_goal, views, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(pageId, "Fall Roof Inspection Promo", "fall-roof-inspection", "PUBLISHED",
        JSON.stringify([
          { id: uid(), type: "HEADLINE", text: "Free roof inspection this fall.", sub: "Catch damage before winter — 20-minute visit, no obligation." },
          { id: uid(), type: "BENEFITS", heading: "What's included", body: "Full roof + gutter inspection, photo report, same-day repair estimate if needed." },
          { id: uid(), type: "BUTTON", text: "Book my free inspection" },
        ]), formId, null, JSON.stringify({ title: "Free Roof Inspection — Fall Promo" }), "form_submitted", 612, createdBy, daysAgo(58), daysAgo(58)).run();

    // ---- Campaigns ----
    const campaignMeta = uid(); const campaignGoogle = uid();
    await db.batch([
      db.prepare(`INSERT INTO gi_campaigns (id, name, channel, utm_campaign, spend_cents, status, starts_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(campaignMeta, "Meta — Roofing Fall Promo", "META", "roofing-fall-promo", 480000, "ACTIVE", daysAgo(58), daysAgo(58), now),
      db.prepare(`INSERT INTO gi_campaigns (id, name, channel, utm_campaign, spend_cents, status, starts_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(campaignGoogle, "Google Search — Roofing", "GOOGLE", "roofing-search", 312000, "ACTIVE", daysAgo(58), daysAgo(58), now),
    ]);

    // ---- Tracked links ----
    await db.batch([
      db.prepare(`INSERT INTO gi_tracked_links (id, slug, label, destination_url, campaign_id, source, medium, clicks, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(uid(), "tradeshow-fall", "Fall Trade Show QR", "https://example.com/fall-roof-inspection", null, "qr", "offline", 214, createdBy, daysAgo(40)),
      db.prepare(`INSERT INTO gi_tracked_links (id, slug, label, destination_url, campaign_id, source, medium, clicks, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(uid(), "partner-roofpro", "RoofPro Partner Referral", "https://example.com/fall-roof-inspection", null, "referral-partner", "referral", 87, createdBy, daysAgo(35)),
    ]);

    // ---- AI agents (defined, not run — running costs a real API call) ----
    const agentDefs: Array<[string, string, string]> = [
      ["Roofing Lead Qualifier", "LEAD_QUALIFICATION", "You qualify residential roofing leads. Prioritize roof age 16+ years and any mention of leaks or storm damage."],
      ["Deal Desk Assistant", "SALES_ASSISTANT", "You brief reps before a call using the prospect's real tracked journey."],
      ["Growth Analyst", "ATTRIBUTION_ANALYST", "You answer revenue-attribution questions using only the real data provided."],
      ["Pipeline Recovery", "REVENUE_RECOVERY", "You identify the most worth recovering from stalled roofing opportunities."],
    ];
    for (const [name, type, instructions] of agentDefs) {
      await db.prepare(`INSERT INTO gi_agents (id, name, type, instructions, allowed_actions_json, channels_json, business_hours_json, escalation_json, requires_human_approval, active, created_by, created_at, updated_at)
        VALUES (?,?,?,?,'[]','[]','{}','{}',0,1,?,?,?)`).bind(uid(), name, type, instructions, createdBy, daysAgo(55), daysAgo(55)).run();
    }

    // ---- Simulated visitor journeys (real gi_events + real CRM contacts/opportunities) ----
    let leadCount = 0; let customerCount = 0;
    const usedNames = new Set<string>();
    for (let i = 0; i < 26; i++) {
      const daysBack = rand(1, 56);
      const attribution = pick(SOURCES);
      const visitorId = uid();
      const sessionId = uid();
      await db.prepare("INSERT INTO gi_visitors (id, first_seen_at, last_seen_at, created_at) VALUES (?,?,?,?)").bind(visitorId, daysAgo(daysBack), daysAgo(daysBack - 1 >= 0 ? daysBack - 1 : 0), daysAgo(daysBack)).run();
      await db.prepare(`INSERT INTO gi_sessions (id, visitor_id, source, medium, campaign, utm_source, utm_medium, utm_campaign, referrer, landing_page_url, device, started_at, last_event_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(sessionId, visitorId, attribution.source, attribution.medium, attribution.campaign, attribution.source, attribution.medium, attribution.campaign, null, "https://example.com/fall-roof-inspection", pick(["desktop", "mobile", "mobile", "tablet"]), daysAgo(daysBack), daysAgo(daysBack)).run();
      await recordEvent({ visitorId, sessionId, eventType: "visitor.created", source: attribution.source, campaign: attribution.campaign });
      await db.prepare("UPDATE gi_events SET created_at=? WHERE visitor_id=? AND event_type='visitor.created'").bind(daysAgo(daysBack), visitorId).run();
      await recordEvent({ visitorId, sessionId, eventType: "page.viewed", landingPageId: pageId, source: attribution.source, campaign: attribution.campaign });
      await db.prepare("UPDATE gi_events SET created_at=? WHERE visitor_id=? AND event_type='page.viewed'").bind(daysAgo(daysBack), visitorId).run();
      await recordEvent({ visitorId, sessionId, eventType: "form.viewed", formId, source: attribution.source, campaign: attribution.campaign });
      await db.prepare("UPDATE gi_events SET created_at=? WHERE visitor_id=? AND event_type='form.viewed'").bind(daysAgo(daysBack), visitorId).run();
      await db.prepare("UPDATE gi_forms SET views = views + 1 WHERE id=?").bind(formId).run();

      const converts = i < 20; // most visitors convert in this demo set; the rest show real funnel drop-off
      if (!converts) continue;

      await recordEvent({ visitorId, sessionId, eventType: "form.started", formId, source: attribution.source, campaign: attribution.campaign });
      await db.prepare("UPDATE gi_events SET created_at=? WHERE visitor_id=? AND event_type='form.started'").bind(daysAgo(daysBack), visitorId).run();
      await db.prepare("UPDATE gi_forms SET starts = starts + 1 WHERE id=?").bind(formId).run();

      const submits = i < 16; // some starters abandon — real funnel shape
      if (!submits) {
        const subId = uid();
        await db.prepare("INSERT INTO gi_form_submissions (id, form_id, visitor_id, session_id, answers_json, current_step, status, started_at) VALUES (?,?,?,?,?,0,'ABANDONED',?)")
          .bind(subId, formId, visitorId, sessionId, "{}", daysAgo(daysBack)).run();
        await recordEvent({ visitorId, sessionId, eventType: "form.abandoned", formId, source: attribution.source, campaign: attribution.campaign });
        await db.prepare("UPDATE gi_events SET created_at=? WHERE visitor_id=? AND event_type='form.abandoned'").bind(daysAgo(daysBack), visitorId).run();
        continue;
      }

      let name = pick(NAMES);
      while (usedNames.has(name)) name = `${pick(NAMES)} ${rand(2, 9)}`;
      usedNames.add(name);
      const email = `${name.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, ".")}@example.com`;

      const { contact, created } = await syncContact({
        fullName: name, email, source: attribution.source, visitorId, formId,
        attribution: { source: attribution.source, medium: attribution.medium, campaign: attribution.campaign, landingPage: "https://example.com/fall-roof-inspection" },
      });
      await db.prepare("UPDATE crm_contacts SET created_at=?, updated_at=?, gi_first_touch_at=?, gi_latest_session_at=? WHERE id=?")
        .bind(daysAgo(daysBack), daysAgo(daysBack), daysAgo(daysBack), daysAgo(daysBack), contact.id).run();

      await db.prepare("UPDATE gi_forms SET submissions = submissions + 1 WHERE id=?").bind(formId).run();
      await recordEvent({ visitorId, sessionId, contactId: String(contact.id), eventType: "form.submitted", formId, source: attribution.source, campaign: attribution.campaign });
      await recordEvent({ visitorId, sessionId, contactId: String(contact.id), eventType: created ? "crm.contact_created" : "crm.contact_updated", formId, source: attribution.source, campaign: attribution.campaign });
      await db.prepare("UPDATE gi_events SET created_at=? WHERE visitor_id=? AND event_type IN ('form.submitted','crm.contact_created','crm.contact_updated')").bind(daysAgo(daysBack), visitorId).run();
      leadCount++;

      const value = rand(3200, 14800) * 100;
      const opportunity = await createOpportunityForContact({
        contactId: String(contact.id), accountId: String(contact.account_id), name: `${name} — roof inspection`,
        source: attribution.source, campaign: attribution.campaign, formId, valueCents: value,
      });
      await recordEvent({ visitorId, sessionId, contactId: String(contact.id), opportunityId: String(opportunity.id), eventType: "crm.opportunity_created", formId, source: attribution.source, campaign: attribution.campaign });
      await db.prepare("UPDATE gi_events SET created_at=? WHERE visitor_id=? AND event_type='crm.opportunity_created'").bind(daysAgo(daysBack), visitorId).run();

      const closes = i < 9; // real close rate off the leads, not every lead
      if (closes) {
        const closeDay = Math.max(0, daysBack - rand(3, 12));
        await db.prepare("UPDATE crm_opportunities SET stage='CLOSED WON', payment_status='PAID', collected_cents=value_cents, paid_at=?, updated_at=? WHERE id=?")
          .bind(daysAgo(closeDay), daysAgo(closeDay), opportunity.id).run();
        await recordEvent({ visitorId, sessionId, contactId: String(contact.id), opportunityId: String(opportunity.id), eventType: "payment.completed", eventValueCents: value, formId, source: attribution.source, campaign: attribution.campaign });
        await db.prepare("UPDATE gi_events SET created_at=? WHERE visitor_id=? AND event_type='payment.completed'").bind(daysAgo(closeDay), visitorId).run();
        await recordEvent({ visitorId, sessionId, contactId: String(contact.id), opportunityId: String(opportunity.id), eventType: "revenue.recorded", eventValueCents: value, formId, source: attribution.source, campaign: attribution.campaign });
        await db.prepare("UPDATE gi_events SET created_at=? WHERE visitor_id=? AND event_type='revenue.recorded'").bind(daysAgo(closeDay), visitorId).run();
        customerCount++;
      }
    }

    // ---- Experiment (real A/B counters so the significance test has data) ----
    const experimentId = uid();
    await db.prepare(`INSERT INTO gi_experiments (id, name, target_type, target_id, variant_a_json, variant_b_json, status, started_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(experimentId, "Headline test — “Free” vs “20-Minute”", "LANDING_PAGE", pageId, JSON.stringify({ label: "Free roof inspection" }), JSON.stringify({ label: "20-minute roof check" }), "RUNNING", daysAgo(20), daysAgo(20)).run();
    const experimentEvents: Array<[string, string, number]> = [];
    for (let i = 0; i < 340; i++) experimentEvents.push(["A", "VIEW", 0]);
    for (let i = 0; i < 52; i++) experimentEvents.push(["A", "CONVERSION", 0]);
    for (let i = 0; i < 318; i++) experimentEvents.push(["B", "VIEW", 0]);
    for (let i = 0; i < 71; i++) experimentEvents.push(["B", "CONVERSION", 0]);
    await db.batch(experimentEvents.map(([variant, type]) => db.prepare("INSERT INTO gi_experiment_events (id, experiment_id, variant, event_type, value_cents, created_at) VALUES (?,?,?,?,?,?)").bind(uid(), experimentId, variant, type, 0, daysAgo(rand(0, 19)))));

    return Response.json({ seeded: true, leadCount, customerCount });
  } catch (error) {
    console.error("growth.seed_demo_failed", error);
    return Response.json({ error: "Unable to seed demo data." }, { status: 500 });
  }
}
