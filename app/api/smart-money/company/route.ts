import { recentInsiderTrades, scoredCompanies } from "@/lib/smart-money/engine";
import { smartMoneyError, smartMoneyGuard } from "@/lib/smart-money/guard";

export async function GET(request: Request) {
  try {
    const denied = await smartMoneyGuard(request);
    if (denied) return denied;
    const params = new URL(request.url).searchParams;
    const cusip = (params.get("cusip") || "").toUpperCase();
    const ticker = (params.get("ticker") || "").toUpperCase();
    const company = (await scoredCompanies()).find((c) => (cusip && c.cusip === cusip) || (ticker && c.ticker === ticker));
    if (!company) return Response.json({ error: "Company is not held by any tracked investor." }, { status: 404 });
    const insiders = company.ticker ? await recentInsiderTrades({ ticker: company.ticker, days: 180, limit: 50 }) : [];
    return Response.json({ company, insiders });
  } catch (error) {
    return smartMoneyError("company", error);
  }
}
