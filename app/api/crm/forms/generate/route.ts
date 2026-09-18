/**
 * Real AI form-field generation for CRM intake forms — same Anthropic call
 * pattern as app/api/studio/ai-rewrite/route.ts. Given a plain-language
 * description, returns a real list of question fields; never fabricates
 * a result if the API key isn't configured or the call fails.
 */
import { ensureCoreSchema, hasModuleAccess } from "@/lib/core/db";
import { env } from "cloudflare:workers";
type CfEnv = Record<string, string | undefined>;

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "CRM access required." }, { status: 403 });
    const body = (await request.json()) as { description?: string };
    const description = String(body.description || "").trim().slice(0, 500);
    if (!description) return Response.json({ error: "Describe the form you want first." }, { status: 400 });

    const cfEnv = env as CfEnv;
    const apiKey = cfEnv.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: "AI form generation isn't configured (missing API key)." }, { status: 503 });

    const prompt = `You are designing a client intake questionnaire for a business. Description: "${description}"

Generate 4-8 real, specific questions for this intake form. Respond with ONLY a JSON array, no explanation or markdown fences, in this exact shape:
[{ "label": string, "type": "SHORT"|"LONG"|"EMAIL"|"PHONE"|"NUMBER"|"DATE"|"SELECT"|"CHECKBOX", "required": boolean, "options": string[] }]

Rules:
- "options" is only used for SELECT and CHECKBOX types; use [] otherwise.
- Always include one EMAIL question and keep questions concrete to the described business, never generic filler.
- Order questions in the sequence a real intake conversation would ask them.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return Response.json({ error: `AI request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}` }, { status: 502 });
    }
    type AnthropicResponse = { content?: Array<{ type: string; text?: string }> };
    const data = (await response.json()) as AnthropicResponse;
    const text = data.content?.find((b) => b.type === "text")?.text || "";
    const cleaned = text.replace(/^```json\s*|```\s*$/g, "").trim();
    let fields: Array<{ label: string; type: string; required: boolean; options: string[] }>;
    try {
      fields = JSON.parse(cleaned);
      if (!Array.isArray(fields)) throw new Error("not an array");
    } catch {
      return Response.json({ error: "AI returned an unexpected format — try again." }, { status: 502 });
    }
    const withIds = fields.slice(0, 12).map((f) => ({
      id: crypto.randomUUID(),
      label: String(f.label || "Untitled question").slice(0, 200),
      type: ["SHORT", "LONG", "EMAIL", "PHONE", "NUMBER", "DATE", "SELECT", "CHECKBOX"].includes(f.type) ? f.type : "SHORT",
      required: Boolean(f.required),
      options: Array.isArray(f.options) ? f.options.map((o) => String(o).slice(0, 100)).slice(0, 10) : [],
    }));
    return Response.json({ fields: withIds });
  } catch (error) {
    console.error("crm.forms.generate_failed", error);
    return Response.json({ error: "Unable to generate form fields." }, { status: 500 });
  }
}
