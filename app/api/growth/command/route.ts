/**
 * Command bar — translates a natural-language question into a real answer
 * grounded in real Growth Intelligence data (attribution, forms, revenue
 * recovery), plus a suggested module to open. It answers questions; it
 * does not execute destructive actions — creating things still goes
 * through their own real endpoints.
 */
import { env } from "cloudflare:workers";
import { coreDb, hasModuleAccess } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";
import { loadEvents, attributeRevenue, rollupBySource, rollupByCampaign } from "@/lib/growth/attribution";

type CfEnv = Record<string, string | undefined>;
const MODULES = ["overview", "forms", "landing-pages", "journeys", "attribution", "tracking", "campaigns", "agents", "conversations", "revenue-intelligence", "experiments", "integrations"];

export async function POST(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "Access required." }, { status: 403 });
    const body = (await request.json()) as { query?: string };
    const query = String(body.query || "").trim().slice(0, 400);
    if (!query) return Response.json({ error: "query is required." }, { status: 400 });

    const cfEnv = env as CfEnv;
    const apiKey = cfEnv.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: "The command bar isn't configured (missing API key)." }, { status: 503 });

    const events = await loadEvents(180);
    const credits = attributeRevenue(events, "LAST_TOUCH", 90);
    const db = coreDb();
    const forms = await db.prepare("SELECT name, views, starts, submissions FROM gi_forms ORDER BY submissions DESC LIMIT 10").all();
    const dataContext = JSON.stringify({
      bySource: rollupBySource(credits).slice(0, 10),
      byCampaign: rollupByCampaign(credits).slice(0, 10),
      forms: forms.results,
      totalTouchpoints: events.length,
    });

    const prompt = `You are the Cyncro Intelligence command bar. Real data (JSON):
${dataContext}

User question: "${query}"

Respond with ONLY JSON, no markdown fences:
{"answer": string, "suggestedModule": one of ${JSON.stringify(MODULES)}}
Base "answer" only on the real data above — if it doesn't contain what's needed, say so plainly rather than guessing. Keep "answer" under 100 words.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return Response.json({ error: `AI request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}` }, { status: 502 });
    }
    type AnthropicResponse = { content?: Array<{ type: string; text?: string }> };
    const data = (await response.json()) as AnthropicResponse;
    const text = data.content?.find((b) => b.type === "text")?.text || "";
    const cleaned = text.replace(/^```json\s*|```\s*$/g, "").trim();
    let parsed: { answer: string; suggestedModule: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return Response.json({ answer: text, suggestedModule: null });
    }
    return Response.json(parsed);
  } catch (error) {
    console.error("growth.command_failed", error);
    return Response.json({ error: "Unable to process command." }, { status: 500 });
  }
}
