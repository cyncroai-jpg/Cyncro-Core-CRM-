import { applyScreen, listInvestors, parseFilters, scoredCompanies } from "@/lib/smart-money/engine";
import { getMeta } from "@/lib/smart-money/db";
import { smartMoneyError, smartMoneyGuard } from "@/lib/smart-money/guard";

/** Screener: GET /api/smart-money?minHolders=3&activity=new&sort=score */
export async function GET(request: Request) {
  try {
    const denied = await smartMoneyGuard(request);
    if (denied) return denied;
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const filters = parseFilters(params);
    const [companies, investors, liveAt, liveError] = await Promise.all([
      scoredCompanies(),
      listInvestors(),
      getMeta("live_at"),
      getMeta("live_error"),
    ]);
    const { total, rows } = applyScreen(companies, filters);
    const synced = investors.filter((inv) => inv.latest_period);
    return Response.json({
      filters,
      total,
      companies: rows,
      investors,
      stats: {
        investorsTracked: investors.length,
        investorsSynced: synced.length,
        aumTracked: synced.reduce((sum, inv) => sum + (inv.portfolio_value || 0), 0),
        companiesTracked: companies.filter((c) => c.holderCount).length,
        newBuys: companies.filter((c) => c.newCount).length,
        insiderNames: companies.filter((c) => c.insiderBuys30d).length,
      },
      live: { at: Number(liveAt || 0), error: liveError || null },
      ai: Boolean(process.env.ANTHROPIC_API_KEY),
    });
  } catch (error) {
    return smartMoneyError("screen", error);
  }
}
