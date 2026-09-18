import { coreDb, cleanText, hasModuleAccess } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";
import { loadEvents, attributeRevenue, rollupBySource, rollupByCampaign, MODEL_DISCLAIMER, type AttributionModel } from "@/lib/growth/attribution";

const MODELS: AttributionModel[] = ["FIRST_TOUCH", "LAST_TOUCH", "LINEAR", "TIME_DECAY", "POSITION_BASED", "CUSTOM"];

export async function GET(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "Access required." }, { status: 403 });
    const url = new URL(request.url);
    const model = (cleanText(url.searchParams.get("model"), 20).toUpperCase() || "LAST_TOUCH") as AttributionModel;
    if (!MODELS.includes(model)) return Response.json({ error: "Invalid model." }, { status: 400 });
    const lookbackDays = Math.max(1, Math.min(365, Number(url.searchParams.get("lookbackDays") || 90)));
    const sinceDays = Math.max(lookbackDays, Number(url.searchParams.get("sinceDays") || 180));
    const compare = url.searchParams.get("compare") === "1";

    const events = await loadEvents(sinceDays);
    const credits = attributeRevenue(events, model, lookbackDays);
    const bySource = rollupBySource(credits);
    const byCampaign = rollupByCampaign(credits);

    const db = coreDb();
    const spend = await db.prepare("SELECT utm_campaign, name, spend_cents FROM gi_campaigns").all<{ utm_campaign: string; name: string; spend_cents: number }>();
    const spendByCampaign = new Map((spend.results || []).map((s) => [s.utm_campaign, s]));
    const totalSpendCents = (spend.results || []).reduce((sum, s) => sum + Number(s.spend_cents || 0), 0);
    const totalRevenueCents = credits.reduce((sum, c) => sum + c.amountCents, 0);
    const leadsCount = events.filter((e) => e.event_type === "crm.contact_created").length;

    const campaignsWithSpend = byCampaign.map((row) => {
      const spendRow = spendByCampaign.get(row.campaign);
      const spendCents = Number(spendRow?.spend_cents || 0);
      return {
        campaign: spendRow?.name || row.campaign, revenueCents: row.revenueCents, touches: row.touches, spendCents,
        roas: spendCents ? row.revenueCents / spendCents : null,
        costPerLeadCents: null as number | null,
      };
    });

    let comparison: Record<string, Array<{ source: string; revenueCents: number }>> | null = null;
    if (compare) {
      comparison = {};
      for (const m of MODELS) {
        const c = attributeRevenue(events, m, lookbackDays);
        comparison[m] = rollupBySource(c).slice(0, 8).map((r) => ({ source: r.source, revenueCents: r.revenueCents }));
      }
    }

    return Response.json({
      model, lookbackDays, disclaimer: MODEL_DISCLAIMER,
      totals: { revenueCents: totalRevenueCents, spendCents: totalSpendCents, roas: totalSpendCents ? totalRevenueCents / totalSpendCents : null, leads: leadsCount, touchpoints: events.length },
      bySource, byCampaign: campaignsWithSpend, comparison,
    });
  } catch (error) {
    console.error("growth.attribution.load_failed", error);
    return Response.json({ error: "Unable to load attribution data." }, { status: 500 });
  }
}
