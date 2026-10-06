import { liveRefresh, recentInsiderTrades } from "@/lib/smart-money/engine";
import { getMeta, smartMoneyDb, type EventRow } from "@/lib/smart-money/db";
import { smartMoneyError, smartMoneyGuard } from "@/lib/smart-money/guard";

/**
 * Live pulse. Each poll may trigger a throttled upstream refresh (Form 4
 * insider buys, new 13F filings from tracked investors, quotes), then returns
 * events newer than `since`.
 */
export async function GET(request: Request) {
  try {
    const denied = await smartMoneyGuard(request);
    if (denied) return denied;
    const url = new URL(request.url);
    const since = Math.max(0, Number(url.searchParams.get("since")) || 0);
    let refresh: Awaited<ReturnType<typeof liveRefresh>> | { ran: false; error: string };
    try {
      refresh = await liveRefresh();
    } catch (error) {
      refresh = { ran: false, error: error instanceof Error ? error.message : "refresh failed" };
    }
    const { results: events } = await smartMoneyDb()
      .prepare("SELECT * FROM sm_events WHERE id > ? ORDER BY id DESC LIMIT 50")
      .bind(since)
      .all<EventRow>();
    return Response.json({
      refresh,
      events,
      insiders: await recentInsiderTrades({ days: 7, minValue: 50_000, limit: 25 }),
      dataVersion: (await getMeta("data_version")) || "0",
      liveAt: Number((await getMeta("live_at")) || 0),
    });
  } catch (error) {
    return smartMoneyError("live", error);
  }
}
