import { cleanText, coreDb, hasCrmAction } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";
import { loadAgent, runLeadQualification, runSalesAssistant, runAttributionAnalyst, runRevenueRecovery, RUNNABLE_AGENT_TYPES, type GrowthAgentType } from "@/lib/growth/agents";
import { loadEvents, attributeRevenue, rollupBySource, rollupByCampaign } from "@/lib/growth/attribution";

export async function POST(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "edit"))) return Response.json({ error: "Permission required to run an agent." }, { status: 403 });
    const body = (await request.json()) as { agentId?: string; submissionId?: string; contactId?: string; question?: string };
    const agentId = cleanText(body.agentId, 80);
    if (!agentId) return Response.json({ error: "agentId is required." }, { status: 400 });
    const agent = await loadAgent(agentId);
    if (!agent) return Response.json({ error: "Agent not found." }, { status: 404 });
    if (!agent.active) return Response.json({ error: "This agent is turned off." }, { status: 400 });
    const type = agent.type as GrowthAgentType;
    if (!RUNNABLE_AGENT_TYPES.has(type)) {
      return Response.json({ error: `${agent.name} needs a connected channel (SMS, email, or voice) that isn't set up yet — this agent's definition is saved, but Cyncro can't run it for real until that's connected.` }, { status: 503 });
    }

    if (type === "LEAD_QUALIFICATION") {
      const submissionId = cleanText(body.submissionId, 80);
      if (!submissionId) return Response.json({ error: "submissionId is required for this agent." }, { status: 400 });
      const result = await runLeadQualification(agent, submissionId);
      return Response.json(result);
    }
    if (type === "SALES_ASSISTANT") {
      const contactId = cleanText(body.contactId, 80);
      if (!contactId) return Response.json({ error: "contactId is required for this agent." }, { status: 400 });
      const result = await runSalesAssistant(agent, contactId);
      return Response.json(result);
    }
    if (type === "ATTRIBUTION_ANALYST") {
      const question = cleanText(body.question, 400);
      if (!question) return Response.json({ error: "question is required for this agent." }, { status: 400 });
      const events = await loadEvents(180);
      const credits = attributeRevenue(events, "LAST_TOUCH", 90);
      const dataContext = JSON.stringify({ bySource: rollupBySource(credits), byCampaign: rollupByCampaign(credits), totalEvents: events.length });
      const result = await runAttributionAnalyst(agent, question, dataContext);
      return Response.json(result);
    }
    if (type === "REVENUE_RECOVERY") {
      const db = coreDb();
      const staleCutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
      const { results } = await db.prepare(`SELECT id, name, stage, value_cents, updated_at FROM crm_opportunities WHERE stage NOT IN ('CLOSED WON','CLOSED LOST') AND updated_at < ? ORDER BY value_cents DESC LIMIT 20`).bind(staleCutoff).all();
      const result = await runRevenueRecovery(agent, results || []);
      return Response.json(result);
    }
    return Response.json({ error: "Unsupported agent type." }, { status: 400 });
  } catch (error) {
    console.error("growth.agents.run_failed", error);
    const message = error instanceof Error ? error.message : "Unable to run agent.";
    const isConfig = message.includes("not configured") || message.includes("ANTHROPIC_API_KEY");
    return Response.json({ error: message }, { status: isConfig ? 503 : 500 });
  }
}
