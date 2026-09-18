/**
 * Growth Intelligence AI agents.
 *
 * Same proven Anthropic call pattern as lib/core/agents.ts — real API call,
 * honest 503 if unconfigured, honest error propagation on failure, never a
 * faked result. Agents that need a channel Cyncro doesn't have a live
 * integration for yet (SMS, email sending, voice) can be DEFINED here (so
 * the configuration UI is real) but running them returns a clear "not
 * connected" error instead of pretending a message went out.
 */
import { env } from "cloudflare:workers";
import { coreDb } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";
import { recordEvent } from "@/lib/growth/events";

type CfEnv = Record<string, string | undefined>;

export type GrowthAgentType =
  | "LEAD_QUALIFICATION"
  | "APPOINTMENT"
  | "SMS_FOLLOWUP"
  | "EMAIL_FOLLOWUP"
  | "AI_RECEPTIONIST"
  | "REACTIVATION"
  | "SALES_ASSISTANT"
  | "ATTRIBUTION_ANALYST"
  | "REVENUE_RECOVERY";

/** Agent types that can genuinely run today — pure analysis/generation, no external channel required. */
export const RUNNABLE_AGENT_TYPES = new Set<GrowthAgentType>(["LEAD_QUALIFICATION", "SALES_ASSISTANT", "ATTRIBUTION_ANALYST", "REVENUE_RECOVERY"]);

function uid() {
  return crypto.randomUUID();
}

async function callClaude(prompt: string, maxTokens = 700): Promise<string> {
  const cfEnv = env as CfEnv;
  const apiKey = cfEnv.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI agents aren't configured (missing ANTHROPIC_API_KEY).");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`AI request failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
  type AnthropicResponse = { content?: Array<{ type: string; text?: string }> };
  const data = (await response.json()) as AnthropicResponse;
  const text = data.content?.find((b) => b.type === "text")?.text?.trim();
  if (!text) throw new Error("AI returned an empty response.");
  return text;
}

export interface GrowthAgent {
  id: string;
  name: string;
  type: GrowthAgentType;
  instructions: string;
  active: number;
}

export async function loadAgent(agentId: string): Promise<GrowthAgent | null> {
  await ensureGrowthSchema();
  const db = coreDb();
  return (await db.prepare("SELECT id, name, type, instructions, active FROM gi_agents WHERE id=?").bind(agentId).first<GrowthAgent>()) || null;
}

async function insertRun(agentId: string, triggerType: string, contactId: string | null, submissionId: string | null, inputSummary: string): Promise<string> {
  const db = coreDb();
  const id = uid();
  await db.prepare(`INSERT INTO gi_agent_runs (id, agent_id, trigger_type, contact_id, submission_id, input_summary, status, created_at) VALUES (?,?,?,?,?,?, 'PENDING', ?)`)
    .bind(id, agentId, triggerType, contactId, submissionId, inputSummary.slice(0, 2000), new Date().toISOString()).run();
  return id;
}

async function completeRun(runId: string, output: string) {
  await coreDb().prepare("UPDATE gi_agent_runs SET status='COMPLETE', output=? WHERE id=?").bind(output, runId).run();
}

async function failRun(runId: string, error: string) {
  await coreDb().prepare("UPDATE gi_agent_runs SET status='FAILED', error=? WHERE id=?").bind(error, runId).run();
}

/**
 * Lead Qualification Agent — analyzes a real form submission (answers +
 * journey context) and returns lead quality, recommended next action, and
 * anything missing. Writes gi_lead_score back onto the CRM contact.
 */
export async function runLeadQualification(agent: GrowthAgent, submissionId: string): Promise<{ runId: string; output: string; score: number }> {
  await ensureGrowthSchema();
  const db = coreDb();
  const submission = await db.prepare("SELECT * FROM gi_form_submissions WHERE id=?").bind(submissionId).first<Record<string, unknown>>();
  if (!submission) throw new Error("Submission not found.");
  const answers = JSON.parse(String(submission.answers_json || "{}"));
  const inputSummary = `Form answers: ${JSON.stringify(answers).slice(0, 1500)}`;
  const runId = await insertRun(agent.id, "FORM_SUBMITTED", String(submission.contact_id || "") || null, submissionId, inputSummary);
  try {
    const prompt = `${agent.instructions || "You are a B2B lead qualification analyst."}

A prospect just submitted a form. Their real answers (JSON):
${JSON.stringify(answers, null, 2)}

Respond with ONLY JSON in this exact shape, no markdown fences:
{"quality":"HIGH"|"MEDIUM"|"LOW","score":0-100,"recommendedService":string,"urgency":"HIGH"|"MEDIUM"|"LOW","reason":string,"missingInformation":string[],"recommendedNextAction":string}

Base every field only on the real answers above — never invent facts not present in them.`;
    const raw = await callClaude(prompt, 500);
    const cleaned = raw.replace(/^```json\s*|```\s*$/g, "").trim();
    const parsed = JSON.parse(cleaned) as { quality: string; score: number; recommendedService: string; urgency: string; reason: string; missingInformation: string[]; recommendedNextAction: string };
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    await db.prepare("UPDATE gi_form_submissions SET ai_summary=?, lead_score=?, qualification_json=? WHERE id=?")
      .bind(parsed.reason, score, JSON.stringify(parsed), submissionId).run();
    if (submission.contact_id) {
      await db.prepare("UPDATE crm_contacts SET gi_lead_score=? WHERE id=?").bind(score, submission.contact_id).run();
    }
    const output = JSON.stringify(parsed);
    await completeRun(runId, output);
    if (submission.visitor_id) {
      await recordEvent({ visitorId: String(submission.visitor_id), contactId: String(submission.contact_id || "") || null, eventType: "ai.qualified", agentId: agent.id, metadata: { score, quality: parsed.quality } });
    }
    return { runId, output, score };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await failRun(runId, message);
    throw error;
  }
}

/** Sales Assistant — summarizes a contact + their real journey and recommends the next action. */
export async function runSalesAssistant(agent: GrowthAgent, contactId: string): Promise<{ runId: string; output: string }> {
  await ensureGrowthSchema();
  const db = coreDb();
  const contact = await db.prepare("SELECT * FROM crm_contacts WHERE id=?").bind(contactId).first<Record<string, unknown>>();
  if (!contact) throw new Error("Contact not found.");
  const { results: events } = await db.prepare("SELECT event_type, source, campaign, created_at FROM gi_events WHERE contact_id=? ORDER BY created_at ASC LIMIT 50").bind(contactId).all<Record<string, unknown>>();
  const { results: opportunities } = await db.prepare("SELECT name, stage, value_cents FROM crm_opportunities WHERE primary_contact_id=?").bind(contactId).all<Record<string, unknown>>();
  const inputSummary = `Contact ${contact.full_name}, ${events?.length || 0} journey events, ${opportunities?.length || 0} opportunities`;
  const runId = await insertRun(agent.id, "MANUAL", contactId, null, inputSummary);
  try {
    const journeyText = (events || []).map((e) => `${e.created_at}: ${e.event_type}${e.source ? ` via ${e.source}` : ""}${e.campaign ? ` (${e.campaign})` : ""}`).join("\n");
    const opportunityText = (opportunities || []).map((o) => `${o.name}: ${o.stage}, $${(Number(o.value_cents) / 100).toFixed(0)}`).join("\n");
    const prompt = `${agent.instructions || "You are a sales assistant preparing a rep for their next touch with this prospect."}

Contact: ${contact.full_name} (${contact.email || "no email"}, ${contact.phone || "no phone"})
Lifecycle: ${contact.lifecycle}
Original source: ${contact.gi_original_source || "unknown"} / campaign: ${contact.gi_original_campaign || "none"}

Journey events (chronological):
${journeyText || "No tracked journey events yet."}

Opportunities:
${opportunityText || "No opportunities yet."}

Write a short (under 120 words) brief for the sales rep: what this person cares about based on their real journey, and one concrete recommended next action. Use only the real facts above.`;
    const output = await callClaude(prompt, 400);
    await completeRun(runId, output);
    return { runId, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await failRun(runId, message);
    throw error;
  }
}

/** Attribution Analyst — answers a natural-language question against real attribution/journey data already computed by the caller. */
export async function runAttributionAnalyst(agent: GrowthAgent, question: string, dataContext: string): Promise<{ runId: string; output: string }> {
  const runId = await insertRun(agent.id, "MANUAL", null, null, question);
  try {
    const prompt = `${agent.instructions || "You are a revenue attribution analyst."}

Real attribution data (JSON):
${dataContext}

Question: "${question}"

Answer using ONLY the numbers in the data above — never invent a figure that isn't there. If the data doesn't contain what's needed to answer, say so plainly instead of guessing. Keep the answer under 150 words and cite the specific numbers you used.`;
    const output = await callClaude(prompt, 500);
    await completeRun(runId, output);
    return { runId, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await failRun(runId, message);
    throw error;
  }
}

/** Revenue Recovery — looks at real stale/abandoned/failed records and explains why each is recoverable. */
export async function runRevenueRecovery(agent: GrowthAgent, opportunities: Array<Record<string, unknown>>): Promise<{ runId: string; output: string }> {
  const runId = await insertRun(agent.id, "SCHEDULED", null, null, `${opportunities.length} stale opportunities`);
  try {
    const listText = opportunities.slice(0, 20).map((o) => `- ${o.name}: stage ${o.stage}, $${(Number(o.value_cents) / 100).toFixed(0)}, last updated ${o.updated_at}`).join("\n");
    const prompt = `${agent.instructions || "You identify recoverable revenue from stalled CRM opportunities."}

Real stalled opportunities:
${listText}

Pick the 3 most worth recovering and explain briefly why, using only the data above. Never claim a number is guaranteed — call it a recoverable opportunity, not certain revenue. Under 120 words.`;
    const output = await callClaude(prompt, 400);
    await completeRun(runId, output);
    return { runId, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await failRun(runId, message);
    throw error;
  }
}
