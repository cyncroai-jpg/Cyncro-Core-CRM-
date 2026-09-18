/**
 * Real AI agent actions for the CRM — grounded in a contact's actual data,
 * run through the Anthropic API, persisted with their real output.
 *
 * GET  /api/crm/agents?contactId=X — recent agent runs (optionally scoped to a contact)
 * POST /api/crm/agents { agentType, contactId } — runs a real agent, returns its output
 */
import { cleanText, coreDb, ensureCoreSchema, hasModuleAccess, requestUser } from "@/lib/core/db";
import { runAgent, type AgentType } from "@/lib/core/agents";

const AGENT_TYPES = new Set<AgentType>(["SUMMARIZE_CONTACT", "DRAFT_FOLLOWUP", "SCORE_LEAD"]);

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "CRM access required." }, { status: 403 });
    const contactId = cleanText(new URL(request.url).searchParams.get("contactId"), 80);
    const db = coreDb();
    const q = contactId
      ? db.prepare(`SELECT r.*, c.full_name AS contact_name FROM crm_agent_runs r LEFT JOIN crm_contacts c ON c.id=r.contact_id WHERE r.contact_id=? ORDER BY r.created_at DESC LIMIT 50`).bind(contactId)
      : db.prepare(`SELECT r.*, c.full_name AS contact_name FROM crm_agent_runs r LEFT JOIN crm_contacts c ON c.id=r.contact_id ORDER BY r.created_at DESC LIMIT 50`);
    const { results } = await q.all();
    return Response.json({ runs: results });
  } catch (error) {
    console.error("crm.agents.list_failed", error);
    return Response.json({ error: "Unable to load agent runs." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "CRM access required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const agentType = cleanText(body.agentType, 40).toUpperCase() as AgentType;
    const contactId = cleanText(body.contactId, 80);
    if (!AGENT_TYPES.has(agentType)) return Response.json({ error: "Unknown agent type." }, { status: 400 });
    if (!contactId) return Response.json({ error: "contactId is required." }, { status: 400 });
    const { id, output } = await runAgent(agentType, contactId, requestUser(request));
    return Response.json({ id, output }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run agent.";
    console.error("crm.agents.run_failed", error);
    return Response.json({ error: message }, { status: message.includes("not configured") || message.includes("ANTHROPIC_API_KEY") ? 503 : 500 });
  }
}
