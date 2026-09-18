/**
 * CRM Agent Team — real AI actions, run through the same Anthropic call
 * pattern already used by app/api/studio/ai-rewrite/route.ts.
 *
 * Every run is grounded in this contact's actual CRM data (real activities,
 * real opportunities, real notes) — never a fabricated persona or invented
 * stat. If no API key is configured, this throws a clear, honest error
 * rather than faking a response.
 */
import { env } from "cloudflare:workers";
import { coreDb } from "@/lib/core/db";

export type AgentType = "SUMMARIZE_CONTACT" | "DRAFT_FOLLOWUP" | "SCORE_LEAD";

type CfEnv = Record<string, string | undefined>;

function anthropicApiKey(): string | undefined {
  const cfEnv = env as CfEnv;
  return cfEnv.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
}

async function callClaude(prompt: string, maxTokens = 600): Promise<string> {
  const apiKey = anthropicApiKey();
  if (!apiKey) throw new Error("AI agents aren't configured yet — no ANTHROPIC_API_KEY is set.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`AI request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  type AnthropicResponse = { content?: Array<{ type: string; text?: string }> };
  const data = (await response.json()) as AnthropicResponse;
  const text = data.content?.find((b) => b.type === "text")?.text || "";
  if (!text.trim()) throw new Error("AI returned an empty response.");
  return text.trim();
}

async function loadContactContext(contactId: string) {
  const db = coreDb();
  const contact = await db.prepare(`SELECT c.*, a.name AS company_name FROM crm_contacts c LEFT JOIN crm_accounts a ON a.id=c.account_id WHERE c.id=?`).bind(contactId).first<Record<string, unknown>>();
  if (!contact) throw new Error("Contact not found.");
  const [activities, opportunities] = await Promise.all([
    db.prepare("SELECT activity_type, title, details, created_at FROM crm_activities WHERE contact_id=? ORDER BY created_at DESC LIMIT 20").bind(contactId).all<Record<string, unknown>>(),
    db.prepare("SELECT name, stage, value_cents, probability, expected_close_date FROM crm_opportunities WHERE primary_contact_id=? ORDER BY updated_at DESC LIMIT 10").bind(contactId).all<Record<string, unknown>>(),
  ]);
  return { contact, activities: activities.results || [], opportunities: opportunities.results || [] };
}

function formatContext(context: Awaited<ReturnType<typeof loadContactContext>>): string {
  const { contact, activities, opportunities } = context;
  const lines = [
    `Contact: ${contact.full_name} (${contact.email || "no email"}, ${contact.phone || "no phone"})`,
    `Title: ${contact.title || "unknown"} at ${contact.company_name || "unknown company"}`,
    `Lifecycle stage: ${contact.lifecycle}`,
    `Notes: ${contact.notes || "none"}`,
    ``,
    `Opportunities (${opportunities.length}):`,
    ...(opportunities.length
      ? opportunities.map((o) => `  - ${o.name}: ${o.stage}, $${(Number(o.value_cents || 0) / 100).toLocaleString()}, ${o.probability}% probability, expected close ${o.expected_close_date || "unknown"}`)
      : ["  (none)"]),
    ``,
    `Recent activity (${activities.length}):`,
    ...(activities.length
      ? activities.map((a) => `  - [${a.created_at}] ${a.activity_type}: ${a.title}${a.details ? ` — ${a.details}` : ""}`)
      : ["  (no recorded activity)"]),
  ];
  return lines.join("\n");
}

const PROMPTS: Record<AgentType, (context: string) => string> = {
  SUMMARIZE_CONTACT: (context) => `You are a sales assistant. Summarize this CRM contact's situation in 3-5 concise sentences a busy rep can read in 10 seconds — where they stand, what's happened, and what's notable. Use only the facts given; never invent numbers, names, or events not in the data below.\n\n${context}`,
  DRAFT_FOLLOWUP: (context) => `You are a sales assistant. Draft a short, natural follow-up email (under 120 words) to this contact based on their real activity and open opportunities below. Reference specific, real details from the data — never invent facts. No subject line, just the email body. Sign off as "the team" (no invented sender name).\n\n${context}`,
  SCORE_LEAD: (context) => `You are a sales assistant. Score this contact's likelihood to close on a 0-100 scale based strictly on the real activity and opportunity data below (engagement recency, opportunity stage/value/probability, notes). Respond in this exact format:\nSCORE: <number>\nREASONING: <2-3 sentences citing specific facts from the data, no invented details>\n\n${context}`,
};

export async function runAgent(agentType: AgentType, contactId: string, createdBy: string): Promise<{ id: string; output: string }> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const context = await loadContactContext(contactId);
  const formattedContext = formatContext(context);
  const inputSummary = `Contact: ${context.contact.full_name} — ${context.opportunities.length} opportunit${context.opportunities.length === 1 ? "y" : "ies"}, ${context.activities.length} activit${context.activities.length === 1 ? "y" : "ies"}`;

  await db.prepare("INSERT INTO crm_agent_runs (id,agent_type,contact_id,input_summary,status,created_by,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id, agentType, contactId, inputSummary, "PENDING", createdBy, now).run();

  try {
    const output = await callClaude(PROMPTS[agentType](formattedContext));
    await db.prepare("UPDATE crm_agent_runs SET output=?, status='COMPLETE' WHERE id=?").bind(output, id).run();
    return { id, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db.prepare("UPDATE crm_agent_runs SET status='FAILED', error=? WHERE id=?").bind(message, id).run();
    throw error;
  }
}
