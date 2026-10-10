/**
 * Cyncro Agents for this company.
 *   GET                       → agents, templates, tool catalogue, recent runs, team (for "acts as")
 *   POST { templateKey | name, role, instructions, tools[], schedule, runHour, autoAct, dailyCap, runAs }  create
 *   POST { action:"run", id, message? }                                                                   run now
 *   PATCH { id, ...fields }    update / toggle
 *   DELETE ?id
 */
import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/tenantAuth";
import { aiConfigured } from "@/lib/ai/assistant";
import { TEMPLATES, TOOL_CATALOG, createAgent, deleteAgent, listAgents, runCustomAgent, updateAgent } from "@/lib/ai/agents";

const canManage = (role: string) => role === "OWNER" || role === "ADMIN";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema(); const t = await requireTenant(request); if (t instanceof Response) return t;
    const agents = (await listAgents(t.tenantId)).map((a) => ({ ...a, tools: JSON.parse(a.tools_json), tools_json: undefined }));
    const { results: runs } = await coreDb().prepare("SELECT id, agent_id, trigger, contact_id, reply, tool_calls_json, acted_json, pending_json, status, error, started_at, finished_at FROM cyncro_agent_runs WHERE tenant_id=? ORDER BY started_at DESC LIMIT 40").bind(t.tenantId).all<Record<string, unknown>>();
    const { results: team } = await coreDb().prepare("SELECT email, display_name, role FROM tenant_members WHERE tenant_id=? AND active=1 ORDER BY display_name").bind(t.tenantId).all();
    const parse = (v: unknown) => { try { return JSON.parse(String(v || "[]")); } catch { return []; } };
    return Response.json({ agents, templates: TEMPLATES, tools: TOOL_CATALOG, team, canManage: canManage(t.role), configured: await aiConfigured(), runs: runs.map((r) => ({ ...r, toolCalls: parse(r.tool_calls_json), acted: parse(r.acted_json), pending: parse(r.pending_json), tool_calls_json: undefined, acted_json: undefined, pending_json: undefined })) });
  } catch (error) { console.error("agents.custom.get_failed", error); return Response.json({ error: "Unable to load agents." }, { status: 500 }); }
}
export async function POST(request: Request) {
  try {
    await ensureCoreSchema(); const t = await requireTenant(request); if (t instanceof Response) return t;
    if (!canManage(t.role)) return Response.json({ error: "Only an owner or admin can manage agents." }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action === "run") {
      const id = cleanText(body.id, 80);
      try { const r = await runCustomAgent(t.tenantId, id, { trigger: "manual", message: cleanText(body.message, 2000) || undefined, by: t.email }); return Response.json(r); }
      catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Run failed." }, { status: 409 }); }
    }
    try { const a = await createAgent(t.tenantId, t.email, body as never); return Response.json({ agent: { ...a, tools: JSON.parse(a.tools_json) } }, { status: 201 }); }
    catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Could not create the agent." }, { status: 400 }); }
  } catch (error) { console.error("agents.custom.post_failed", error); return Response.json({ error: "Agent request failed." }, { status: 500 }); }
}
export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema(); const t = await requireTenant(request); if (t instanceof Response) return t;
    if (!canManage(t.role)) return Response.json({ error: "Only an owner or admin can manage agents." }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const a = await updateAgent(t.tenantId, cleanText(body.id, 80), body); if (!a) return Response.json({ error: "Agent not found." }, { status: 404 });
    return Response.json({ agent: { ...a, tools: JSON.parse(a.tools_json) } });
  } catch (error) { console.error("agents.custom.patch_failed", error); return Response.json({ error: "Unable to save." }, { status: 500 }); }
}
export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema(); const t = await requireTenant(request); if (t instanceof Response) return t;
    if (!canManage(t.role)) return Response.json({ error: "Only an owner or admin can manage agents." }, { status: 403 });
    await deleteAgent(t.tenantId, cleanText(new URL(request.url).searchParams.get("id"), 80)); return Response.json({ deleted: true });
  } catch (error) { console.error("agents.custom.delete_failed", error); return Response.json({ error: "Unable to delete." }, { status: 500 }); }
}
