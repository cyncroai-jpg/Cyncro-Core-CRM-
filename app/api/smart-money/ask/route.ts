import Anthropic from "@anthropic-ai/sdk";
import { askAnalyst, localAnalyst, type AnalystTurn } from "@/lib/smart-money/ai";
import { smartMoneyError, smartMoneyGuard } from "@/lib/smart-money/guard";
import { enforceRateLimit, RateLimitError } from "@/lib/prospecting/rate-limit";

export async function POST(request: Request) {
  try {
    const denied = await smartMoneyGuard(request);
    if (denied) return denied;
    enforceRateLimit(request, "smart-money-ask", 20, 60_000);
    const body = (await request.json()) as { messages?: unknown };
    const history = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m): m is AnalystTurn => !!m && typeof m === "object" && ["user", "assistant"].includes((m as AnalystTurn).role) && typeof (m as AnalystTurn).content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    while (history.length && history[0].role !== "user") history.shift();
    if (!history.length || history[history.length - 1].role !== "user")
      return Response.json({ error: "Ask a question." }, { status: 400 });
    try {
      return Response.json(await askAnalyst(history));
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        console.error("smart-money.claude.failed", error.status, error.message);
        const fallback = await localAnalyst(history[history.length - 1].content);
        return Response.json({ ...fallback, notice: `Claude is unavailable (${error.status ?? "network"}); answered with the local analyst.` });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof RateLimitError) return Response.json({ error: error.message }, { status: error.status });
    return smartMoneyError("ask", error);
  }
}
