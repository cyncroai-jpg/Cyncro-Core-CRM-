import { coreDb, hasModuleAccess } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";
import { loadEvents, attributeRevenue, rollupBySource } from "@/lib/growth/attribution";

/** The Growth Intelligence dashboard — real numbers pulled from gi_events + crm_opportunities, never mock stats. */
export async function GET(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "Access required." }, { status: 403 });
    const db = coreDb();

    const events = await loadEvents(180);
    const credits = attributeRevenue(events, "LAST_TOUCH", 90);
    const bySource = rollupBySource(credits).slice(0, 8);
    const attributedRevenueCents = credits.reduce((sum, c) => sum + c.amountCents, 0);

    const spendRow = await db.prepare("SELECT COALESCE(SUM(spend_cents),0) AS total FROM gi_campaigns").first<{ total: number }>();
    const spendCents = Number(spendRow?.total || 0);

    const leads = events.filter((e) => e.event_type === "crm.contact_created").length;
    const appointments = events.filter((e) => e.event_type === "appointment.booked").length;
    const openPipeline = await db.prepare(`SELECT COALESCE(SUM(value_cents),0) AS total, COUNT(*) AS count FROM crm_opportunities
      WHERE gi_source IS NOT NULL AND stage NOT IN ('CLOSED WON','CLOSED LOST')`).first<{ total: number; count: number }>();
    const customers = await db.prepare(`SELECT COUNT(*) AS count FROM crm_opportunities WHERE gi_source IS NOT NULL AND stage='CLOSED WON'`).first<{ count: number }>();

    const topForms = await db.prepare(`SELECT id, name, views, starts, submissions FROM gi_forms WHERE status='PUBLISHED' ORDER BY submissions DESC LIMIT 5`).all();
    const topLandingPages = await db.prepare(`SELECT id, name, slug, views FROM gi_landing_pages WHERE status='PUBLISHED' ORDER BY views DESC LIMIT 5`).all();

    return Response.json({
      attributedRevenueCents,
      openPipelineCents: Number(openPipeline?.total || 0),
      leads,
      appointments,
      customers: Number(customers?.count || 0),
      blendedRoas: spendCents ? attributedRevenueCents / spendCents : null,
      spendCents,
      revenueBySource: bySource,
      topForms: topForms.results || [],
      topLandingPages: topLandingPages.results || [],
      eventsTracked: events.length,
    });
  } catch (error) {
    console.error("growth.overview.load_failed", error);
    return Response.json({ error: "Unable to load overview." }, { status: 500 });
  }
}
