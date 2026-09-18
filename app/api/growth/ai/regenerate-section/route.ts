/** Regenerates ONE landing-page section's copy with AI — never touches the rest of the page. */
import { env } from "cloudflare:workers";
import { hasCrmAction } from "@/lib/core/db";

type CfEnv = Record<string, string | undefined>;

const SHAPES: Record<string, string> = {
  HEADLINE: '{"headline":string,"sub":string}',
  TEXT: '{"heading":string,"body":string}',
  TESTIMONIAL: '{"quote":string,"author":string}',
  FAQ: '{"question":string,"answer":string}',
  PRICING: '{"title":string,"price":string,"features":string}', // features: newline-separated
};

export async function POST(request: Request) {
  try {
    if (!(await hasCrmAction(request, "edit"))) return Response.json({ error: "Permission required." }, { status: 403 });
    const body = (await request.json()) as { sectionType?: string; business?: string; offer?: string; currentText?: string };
    const sectionType = String(body.sectionType || "");
    const shape = SHAPES[sectionType];
    if (!shape) return Response.json({ error: "This section type can't be AI-regenerated." }, { status: 400 });
    const business = String(body.business || "").trim().slice(0, 200);
    if (!business) return Response.json({ error: "Business name is required." }, { status: 400 });

    const cfEnv = env as CfEnv;
    const apiKey = cfEnv.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: "AI regeneration isn't configured (missing API key)." }, { status: 503 });

    const prompt = `You are writing one section of a landing page for "${business}"${body.offer ? `, offering: ${body.offer}` : ""}.
${body.currentText ? `The current text (rewrite it, don't repeat it verbatim): ${body.currentText}` : ""}

Respond with ONLY JSON, no markdown fences, in this exact shape: ${shape}
Keep it specific to the real business/offer given — never invent unrelated details.`;

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
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return Response.json({ error: "AI returned an unexpected format — try again." }, { status: 502 });
    }
    return Response.json({ data: parsed });
  } catch (error) {
    console.error("growth.ai.regenerate_section_failed", error);
    return Response.json({ error: "Unable to regenerate section." }, { status: 500 });
  }
}
