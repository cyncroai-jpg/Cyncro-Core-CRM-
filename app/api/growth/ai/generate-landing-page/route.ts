/** AI Landing Page Generator — real Anthropic call, same pattern as the rest of this app's AI features. */
import { env } from "cloudflare:workers";
import { hasCrmAction } from "@/lib/core/db";

type CfEnv = Record<string, string | undefined>;

export async function POST(request: Request) {
  try {
    if (!(await hasCrmAction(request, "create"))) return Response.json({ error: "Create permission is required." }, { status: 403 });
    const body = (await request.json()) as { business?: string; offer?: string; industry?: string; targetCustomer?: string; desiredAction?: string; brandInfo?: string };
    const business = String(body.business || "").trim().slice(0, 200);
    const offer = String(body.offer || "").trim().slice(0, 300);
    if (!business || !offer) return Response.json({ error: "Business and offer are required." }, { status: 400 });

    const cfEnv = env as CfEnv;
    const apiKey = cfEnv.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: "AI landing page generation isn't configured (missing API key)." }, { status: 503 });

    const brief = [
      `Business: ${business}`, `Offer: ${offer}`,
      body.industry ? `Industry: ${body.industry}` : null,
      body.targetCustomer ? `Target customer: ${body.targetCustomer}` : null,
      body.desiredAction ? `Desired action: ${body.desiredAction}` : null,
      body.brandInfo ? `Brand info: ${body.brandInfo}` : null,
    ].filter(Boolean).join("\n");

    const prompt = `You are a direct-response landing page copywriter. Using only the real facts below, write a lead-capture landing page — never invent facts about the business.

${brief}

Respond with ONLY JSON, no markdown fences, in this exact shape:
{"headline":string,"subheadline":string,"sections":[{"type":"TEXT"|"BENEFITS"|"TESTIMONIALS"|"FAQ","heading":string,"body":string}],"ctaText":string,"thankYouMessage":string}
Keep it specific and non-generic. 3-5 sections.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return Response.json({ error: `AI request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}` }, { status: 502 });
    }
    type AnthropicResponse = { content?: Array<{ type: string; text?: string }> };
    const data = (await response.json()) as AnthropicResponse;
    const text = data.content?.find((b) => b.type === "text")?.text || "";
    const cleaned = text.replace(/^```json\s*|```\s*$/g, "").trim();
    let page: { headline: string; subheadline: string; sections: Array<{ type: string; heading: string; body: string }>; ctaText: string; thankYouMessage: string };
    try {
      page = JSON.parse(cleaned);
    } catch {
      return Response.json({ error: "AI returned an unexpected format — try again." }, { status: 502 });
    }
    return Response.json({ page });
  } catch (error) {
    console.error("growth.ai.generate_landing_page_failed", error);
    return Response.json({ error: "Unable to generate landing page." }, { status: 500 });
  }
}
