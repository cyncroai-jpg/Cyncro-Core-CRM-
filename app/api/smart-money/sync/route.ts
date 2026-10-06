import { syncInvestor } from "@/lib/smart-money/engine";
import { normalizeCik } from "@/lib/smart-money/investors";
import { smartMoneyError, smartMoneyGuard } from "@/lib/smart-money/guard";
import { enforceRateLimit, RateLimitError } from "@/lib/prospecting/rate-limit";

/** Pulls the latest two 13F-HR filings for one investor from SEC EDGAR. */
export async function POST(request: Request) {
  try {
    const denied = await smartMoneyGuard(request);
    if (denied) return denied;
    enforceRateLimit(request, "smart-money-sync", 40, 60_000);
    const body = (await request.json().catch(() => ({}))) as { cik?: unknown; force?: unknown };
    const cik = normalizeCik(body.cik);
    if (!cik) return Response.json({ error: "A valid SEC CIK is required." }, { status: 400 });
    return Response.json(await syncInvestor(cik, { force: body.force === true }));
  } catch (error) {
    if (error instanceof RateLimitError) return Response.json({ error: error.message }, { status: error.status });
    return smartMoneyError("sync", error);
  }
}
