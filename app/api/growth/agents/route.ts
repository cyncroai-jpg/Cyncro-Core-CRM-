import { cleanText, coreDb, hasCrmAction, hasModuleAccess, requestUser } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";
import { RUNNABLE_AGENT_TYPES, type GrowthAgentType } from "@/lib/growth/agents";

const AGENT_TYPES: GrowthAgentType[] = ["LEAD_QUALIFICATION", "APPOINTMENT", "SMS_FOLLOWUP", "EMAIL_FOLLOWUP", "AI_RECEPTIONIST", "REACTIVATION", "SALES_ASSISTANT", "ATTRIBUTION_ANALYST", "REVENUE_RECOVERY"];

export async function GET(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "Access required." }, { status: 403 });
    const db = coreDb();
    const { results: agents } = await db.prepare("SELECT * FROM gi_agents ORDER BY created_at DESC").all();
    const url = new URL(request.url);
    const agentId = cleanText(url.searchParams.get("agentId"), 80);
    const runsStatement = agentId
      ? db.prepare("SELECT * FROM gi_agent_runs WHERE agent_id=? ORDER BY created_at DESC LIMIT 50").bind(agentId)
      : db.prepare("SELECT * FROM gi_agent_runs ORDER BY created_at DESC LIMIT 50");
    const { results: runs } = await runsStatement.all();
    return Response.json({ agents: (agents || []).map((a) => ({ ...a, runnable: RUNNABLE_AGENT_TYPES.has(String(a.type) as GrowthAgentType) })), runs });
  } catch (error) {
    console.error("growth.agents.list_failed", error);
    return Response.json({ error: "Unable to load agents." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "create"))) return Response.json({ error: "Create permission is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    const type = cleanText(body.type, 40).toUpperCase() as GrowthAgentType;
    if (!name) return Response.json({ error: "Agent name is required." }, { status: 400 });
    if (!AGENT_TYPES.includes(type)) return Response.json({ error: "Invalid agent type." }, { status: 400 });
    const db = coreDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO gi_agents (id, name, type, instructions, allowed_actions_json, channels_json, business_hours_json, escalation_json, requires_human_approval, active, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?)`)
      .bind(id, name, type, cleanText(body.instructions, 4000) || "", JSON.stringify(body.allowedActions || []), JSON.stringify(body.channels || []),
        JSON.stringify(body.businessHours || {}), JSON.stringify(body.escalation || {}), body.requiresHumanApproval ? 1 : 0, requestUser(request), now, now).run();
    const agent = await db.prepare("SELECT * FROM gi_agents WHERE id=?").bind(id).first();
    return Response.json({ agent }, { status: 201 });
  } catch (error) {
    console.error("growth.agents.create_failed", error);
    return Response.json({ error: "Unable to create agent." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "edit"))) return Response.json({ error: "Edit permission is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Agent id is required." }, { status: 400 });
    const updates = (body.updates && typeof body.updates === "object" ? body.updates : {}) as Record<string, unknown>;
    const fields: string[] = []; const values: unknown[] = [];
    const add = (column: string, value: unknown) => { fields.push(`${column} = ?`); values.push(value); };
    if (updates.active !== undefined) add("active", updates.active ? 1 : 0);
    if (updates.instructions !== undefined) add("instructions", cleanText(updates.instructions, 4000));
    if (updates.requiresHumanApproval !== undefined) add("requires_human_approval", updates.requiresHumanApproval ? 1 : 0);
    if (!fields.length) return Response.json({ error: "No valid changes supplied." }, { status: 400 });
    add("updated_at", new Date().toISOString()); values.push(id);
    const db = coreDb();
    await db.prepare(`UPDATE gi_agents SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    const agent = await db.prepare("SELECT * FROM gi_agents WHERE id=?").bind(id).first();
    return agent ? Response.json({ agent }) : Response.json({ error: "Agent not found." }, { status: 404 });
  } catch (error) {
    console.error("growth.agents.update_failed", error);
    return Response.json({ error: "Unable to update agent." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "delete"))) return Response.json({ error: "Delete permission is required." }, { status: 403 });
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Agent id is required." }, { status: 400 });
    await coreDb().prepare("DELETE FROM gi_agents WHERE id=?").bind(id).run();
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("growth.agents.delete_failed", error);
    return Response.json({ error: "Unable to delete agent." }, { status: 500 });
  }
}
