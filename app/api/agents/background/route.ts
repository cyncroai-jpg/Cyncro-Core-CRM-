/**
 * Background agents for this company.
 *   GET                                   → agents (with defaults, settings, last run) + recent runs
 *   PATCH { kind, enabled?, settings? }   → owner/admin toggles or tunes an agent
 *   POST  { kind }                        → owner/admin runs it now; returns the report
 */
import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/tenantAuth";
import { AGENT_KINDS, agentsFor, runAgent, settingsOf, type AgentKind } from "@/lib/agents/background";

const canManage = (role: string) => role === "OWNER" || role === "ADMIN";
const KINDS = new Set(AGENT_KINDS.map((k) => k.kind));

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request); if (tenant instanceof Response) return tenant;
    const rows = await agentsFor(tenant.tenantId);
    const { results: runs } = await coreDb().prepare("SELECT id, kind, trigger, started_at, finished_at, actions, summary, details_json FROM background_agent_runs WHERE tenant_id=? ORDER BY started_at DESC LIMIT 40").bind(tenant.tenantId).all<Record<string, unknown>>();
    const agents = AGENT_KINDS.map((k) => { const r = rows.find((x) => x.kind === k.kind)!; return { ...k, enabled: Boolean(r.enabled), settings: settingsOf(r), lastRunAt: r.last_run_at, lastRun: runs.find((x) => x.kind === k.kind) || null }; });
    return Response.json({ agents, runs: runs.map((r) => ({ ...r, details: (() => { try { return JSON.parse(String(r.details_json || "[]")); } catch { return []; } })(), details_json: undefined })), canManage: canManage(tenant.role) });
  } catch (error) { console.error("agents.background.get_failed", error); return Response.json({ error: "Unable to load agents." }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request); if (tenant instanceof Response) return tenant;
    if (!canManage(tenant.role)) return Response.json({ error: "Only an owner or admin can change agents." }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as { kind?: string; enabled?: boolean; settings?: Record<string, unknown> };
    const kind = cleanText(body.kind, 30).toUpperCase() as AgentKind; if (!KINDS.has(kind)) return Response.json({ error: "Unknown agent." }, { status: 400 });
    const rows = await agentsFor(tenant.tenantId); const row = rows.find((r) => r.kind === kind)!; const def = AGENT_KINDS.find((k) => k.kind === kind)!;
    const next = { ...settingsOf(row) };
    for (const f of def.fields) if (body.settings && body.settings[f.key] !== undefined) next[f.key] = Math.min(f.max, Math.max(f.min, Math.round(Number(body.settings[f.key]) || f.min)));
    await coreDb().prepare("UPDATE background_agents SET enabled=?, settings_json=?, updated_at=? WHERE id=?").bind(body.enabled !== undefined ? (body.enabled ? 1 : 0) : row.enabled, JSON.stringify(next), new Date().toISOString(), row.id).run();
    return Response.json({ saved: true, enabled: body.enabled !== undefined ? Boolean(body.enabled) : Boolean(row.enabled), settings: next });
  } catch (error) { console.error("agents.background.patch_failed", error); return Response.json({ error: "Unable to save." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request); if (tenant instanceof Response) return tenant;
    if (!canManage(tenant.role)) return Response.json({ error: "Only an owner or admin can run agents." }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as { kind?: string };
    const kind = cleanText(body.kind, 30).toUpperCase() as AgentKind; if (!KINDS.has(kind)) return Response.json({ error: "Unknown agent." }, { status: 400 });
    return Response.json(await runAgent(tenant.tenantId, kind, "manual"));
  } catch (error) { console.error("agents.background.post_failed", error); return Response.json({ error: "Agent run failed." }, { status: 500 }); }
}
