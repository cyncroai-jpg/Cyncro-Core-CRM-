import { coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";
import { env } from "cloudflare:workers";
type CfEnv = Record<string, string | undefined>;

async function requireStudioAccess(request: Request) {
  const email = requestUser(request);
  if (email === "platform-owner") return true;
  const member = await coreDb().prepare("SELECT active FROM workspace_members WHERE email=?").bind(email).first<{ active: number }>();
  if (!member) {
    const count = await coreDb().prepare("SELECT COUNT(*) AS c FROM workspace_members").first<{ c: number }>();
    if (!Number(count?.c || 0)) return true;
  }
  return Boolean(member?.active);
}

const FIELD_GUIDE: Record<string, string> = {
  hero: `{ "eyebrow": string, "headline": string, "subheadline": string, "ctaLabel": string }`,
  text: `{ "heading": string, "body": string }`,
  testimonial: `{ "quote": string, "name": string, "role": string }`,
  faq: `{ "items": [{ "q": string, "a": string }, ...] } — keep the same number of items unless asked to add/remove`,
  cta: `{ "heading": string, "buttonLabel": string }`,
  form: `{ "heading": string, "subheading": string, "submitLabel": string, "successMessage": string } — do not change "fields"`,
  image: `{ "caption": string } — do not invent a "url"`,
};

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireStudioAccess(request))) return Response.json({ error: "Studio access required." }, { status: 403 });
    const body = await request.json() as { sectionType?: string; props?: Record<string, unknown>; instruction?: string };
    const sectionType = String(body.sectionType || "");
    const props = body.props || {};
    const instruction = String(body.instruction || "").trim().slice(0, 500);
    if (!sectionType || !FIELD_GUIDE[sectionType]) return Response.json({ error: "Unsupported section type." }, { status: 400 });
    if (!instruction) return Response.json({ error: "Describe what you want changed." }, { status: 400 });

    const cfEnv = env as CfEnv;
    const apiKey = cfEnv.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: "AI rewriting isn't configured (missing API key)." }, { status: 503 });

    const editableProps = { ...props };
    delete editableProps.fields;
    delete editableProps.url;
    delete editableProps.align;
    delete editableProps.ctaHref;
    delete editableProps.buttonHref;

    const prompt = `You are a conversion copywriter editing one section of a marketing landing page.

Section type: ${sectionType}
Current content (JSON): ${JSON.stringify(editableProps)}

Instruction from the page editor: "${instruction}"

Rewrite the content to satisfy the instruction. Keep the same JSON shape:
${FIELD_GUIDE[sectionType]}

Rules:
- Only include the keys shown above, nothing else.
- Keep copy concrete and specific to what a small/mid-size service business would say — never generic filler.
- Keep roughly the same length as the original unless the instruction asks for more/less.
- Respond with ONLY valid JSON, no explanation or markdown fences.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) {
      console.warn("studio.ai_rewrite.failed", response.status);
      return Response.json({ error: "AI rewrite failed — try again." }, { status: 502 });
    }
    type AnthropicResponse = { content?: Array<{ type: string; text?: string }> };
    const data = (await response.json()) as AnthropicResponse;
    const text = data.content?.find((b) => b.type === "text")?.text || "";
    const cleaned = text.replace(/^```json\s*|```\s*$/g, "").trim();
    let rewritten: Record<string, unknown>;
    try {
      rewritten = JSON.parse(cleaned) as Record<string, unknown>;
    } catch (err) {
      console.warn("studio.ai_rewrite.parse_failed", err, text);
      return Response.json({ error: "AI returned an unexpected format — try again." }, { status: 502 });
    }

    const merged = { ...props, ...rewritten };
    return Response.json({ props: merged });
  } catch (error) {
    console.error("studio.ai_rewrite.error", error);
    return Response.json({ error: "Unable to run AI rewrite." }, { status: 500 });
  }
}
