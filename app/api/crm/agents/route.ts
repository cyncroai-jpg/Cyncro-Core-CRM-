/**
 * Real AI agent actions for the CRM — grounded in a contact's actual data,
 * run through the Anthropic API, persisted with their real output.
 *
 * GET  /api/crm/agents?contactId=X — recent agent runs (optionally scoped to a contact)
 * POST /api/crm/agents { agentType, contactId } — runs a real agent, returns its output
 */
import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant, requireTenantAction } from "@/lib/core/tenantAuth";
import { runAgent, type AgentType } from "@/lib/core/agents";

const AGENT_TYPES = new Set<AgentType>(["SUMMARIZE_CONTACT", "DRAFT_FOLLOWUP", "SCORE_LEAD"]);

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const contactId = cleanText(new URL(request.url).searchParams.get("contactId"), 80);
    const db = coreDb();
    const q = contactId
      ? db.prepare(`SELECT r.*, c.full_name AS contact_name FROM crm_agent_runs r LEFT JOIN crm_contacts c ON c.id=r.contact_id WHERE r.contact_id=? AND r.tenant_id=? ORDER BY r.created_at DESC LIMIT 50`).bind(contactId, tenant.tenantId)
      : db.prepare(`SELECT r.*, c.full_name AS contact_name FROM crm_agent_runs r LEFT JOIN crm_contacts c ON c.id=r.contact_id WHERE r.tenant_id=? ORDER BY r.created_at DESC LIMIT 50`).bind(tenant.tenantId);
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
    const tenant = await requireTenantAction(request, "create");
    if (tenant instanceof Response) return tenant;
    const body = (await request.json()) as Record<string, unknown>;
    const agentType = cleanText(body.agentType, 40).toUpperCase() as AgentType;
    const contactId = cleanText(body.contactId, 80);
    if (!AGENT_TYPES.has(agentType)) return Response.json({ error: "Unknown agent type." }, { status: 400 });
    if (!contactId) return Response.json({ error: "contactId is required." }, { status: 400 });
    const contact = await coreDb().prepare("SELECT id FROM crm_contacts WHERE id=? AND tenant_id=?").bind(contactId, tenant.tenantId).first();
    if (!contact) return Response.json({ error: "Contact not found." }, { status: 404 });
    const { id, output } = await runAgent(agentType, contactId, tenant.email);
    await coreDb().prepare("UPDATE crm_agent_runs SET tenant_id=? WHERE id=?").bind(tenant.tenantId, id).run();
    return Response.json({ id, output }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run agent.";
    console.error("crm.agents.run_failed", error);
    return Response.json({ error: message }, { status: message.includes("not configured") || message.includes("ANTHROPIC_API_KEY") ? 503 : 500 });
  }
}
