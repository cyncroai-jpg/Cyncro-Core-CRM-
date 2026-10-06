import { recentInsiderTrades } from "@/lib/smart-money/engine";
import { smartMoneyError, smartMoneyGuard } from "@/lib/smart-money/guard";

export async function GET(request: Request) {
  try {
    const denied = await smartMoneyGuard(request);
    if (denied) return denied;
    const params = new URL(request.url).searchParams;
    const trades = await recentInsiderTrades({
      minValue: Number(params.get("minValue")) || 0,
      days: Math.min(Number(params.get("days")) || 30, 180),
      ticker: params.get("ticker") || undefined,
      limit: 300,
    });
    return Response.json({ trades });
  } catch (error) {
    return smartMoneyError("insiders", error);
  }
}
