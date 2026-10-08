/**
 * Cyncro AI: one assistant per teammate, inside one company.
 *
 * Reads happen on their own during a turn. Writes never run from the model's
 * say-so: the turn stops, the proposed action is stored as PENDING, and the
 * teammate approves or dismisses it in the drawer. Approval runs the same tool
 * the MCP server exposes, and the audit log records it as done by Cyncro AI
 * for that teammate.
 */
import { env } from "cloudflare:workers";
import { coreDb, type TenantContext } from "@/lib/core/db";
import { companySettings } from "@/lib/core/companySettings";
import { TOOLS, describeAction, runTool, toolByName, type ToolCtx } from "@/lib/ai/tools";

type CfEnv = Record<string, string | undefined>;
const cf = () => env as unknown as CfEnv;
const apiKey = () => cf().ANTHROPIC_API_KEY || (typeof process !== "undefined" ? process.env.ANTHROPIC_API_KEY : undefined);
const baseUrl = () => (cf().ANTHROPIC_BASE_URL || (typeof process !== "undefined" ? process.env.ANTHROPIC_BASE_URL : undefined) || "https://api.anthropic.com").replace(/\/$/, "");
const MODEL = () => cf().CYNCRO_AI_MODEL || "claude-opus-5";
const now = () => new Date().toISOString();
const month = () => now().slice(0, 7);

type Block = Record<string, unknown> & { type: string };
type Msg = { role: "user" | "assistant"; content: string | Block[] };
export type PendingAction = { id: string; tool: string; input: Record<string, unknown>; summary: string; created_at: string };
export type AssistantReply = { reply: string; pending: PendingAction[]; acted: { id: string; summary: string; ok: boolean }[]; usage: { calls: number; cap: number }; toolCalls: string[] };

export async function aiConfigured(): Promise<boolean> { return Boolean(apiKey()); }

export async function usageFor(tenantId: string) {
  const row = await coreDb().prepare("SELECT calls, input_tokens, output_tokens FROM ai_usage WHERE tenant_id=? AND month=?").bind(tenantId, month()).first<{ calls: number; input_tokens: number; output_tokens: number }>();
  const cap = (await companySettings(tenantId)).aiMonthlyCap;
  return { calls: Number(row?.calls || 0), input_tokens: Number(row?.input_tokens || 0), output_tokens: Number(row?.output_tokens || 0), cap, month: month() };
}
async function bump(tenantId: string, input: number, output: number) {
  await coreDb().prepare("INSERT INTO ai_usage (tenant_id, month, calls, input_tokens, output_tokens) VALUES (?,?,1,?,?) ON CONFLICT(tenant_id, month) DO UPDATE SET calls=calls+1, input_tokens=input_tokens+excluded.input_tokens, output_tokens=output_tokens+excluded.output_tokens").bind(tenantId, month(), input, output).run();
}

export async function history(tenant: TenantContext, limit = 40) {
  const { results } = await coreDb().prepare("SELECT id, role, content, created_at FROM ai_conversations WHERE tenant_id=? AND user_email=? ORDER BY created_at DESC LIMIT ?").bind(tenant.tenantId, tenant.email, limit).all<{ id: string; role: string; content: string; created_at: string }>();
  return results.reverse();
}
async function remember(tenant: TenantContext, role: "user" | "assistant", content: string) {
  await coreDb().prepare("INSERT INTO ai_conversations (id, tenant_id, user_email, role, content, created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), tenant.tenantId, tenant.email, role, content.slice(0, 8000), now()).run();
}
export async function forget(tenant: TenantContext) {
  await coreDb().batch([
    coreDb().prepare("DELETE FROM ai_conversations WHERE tenant_id=? AND user_email=?").bind(tenant.tenantId, tenant.email),
    coreDb().prepare("UPDATE ai_pending_actions SET status='DISMISSED', resolved_at=? WHERE tenant_id=? AND user_email=? AND status='PENDING'").bind(now(), tenant.tenantId, tenant.email),
  ]);
}
export async function pendingFor(tenant: TenantContext): Promise<PendingAction[]> {
  const { results } = await coreDb().prepare("SELECT id, tool, input, summary, created_at FROM ai_pending_actions WHERE tenant_id=? AND user_email=? AND status='PENDING' ORDER BY created_at").bind(tenant.tenantId, tenant.email).all<{ id: string; tool: string; input: string; summary: string; created_at: string }>();
  return results.map((r) => ({ id: r.id, tool: r.tool, input: JSON.parse(r.input), summary: r.summary, created_at: r.created_at }));
}

/** Connected MCP servers for this company, in the shape the Messages API wants. */
async function mcpServers(tenantId: string) {
  const { results } = await coreDb().prepare("SELECT name, url, auth_token FROM mcp_connections WHERE tenant_id=? AND active=1 ORDER BY created_at").bind(tenantId).all<{ name: string; url: string; auth_token: string | null }>();
  return results.map((r) => ({ type: "url", url: r.url, name: r.name.replace(/[^a-z0-9_-]/gi, "-").toLowerCase(), ...(r.auth_token ? { authorization_token: r.auth_token } : {}) }));
}

async function systemPrompt(tenant: TenantContext, screen: string) {
  const db = coreDb();
  const [company, member, settings] = await Promise.all([
    db.prepare("SELECT name FROM tenants WHERE id=?").bind(tenant.tenantId).first<{ name: string }>(),
    db.prepare("SELECT display_name FROM tenant_members WHERE tenant_id=? AND email=?").bind(tenant.tenantId, tenant.email).first<{ display_name: string }>(),
    companySettings(tenant.tenantId),
  ]);
  const localNow = new Date().toLocaleString("en-US", { timeZone: settings.timezone, weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  return [
    `You are Cyncro AI, the assistant built into Cyncro Core for ${company?.name || "this company"}. You are talking with ${member?.display_name || tenant.email} (${tenant.email}, role ${tenant.role}).`,
    `Now: ${localNow} (${settings.timezone}). Business hours ${settings.businessHours.start}-${settings.businessHours.end} on days ${settings.businessHours.days.join(",")} (0=Sunday).${settings.phone ? ` Company phone ${settings.phone}.` : ""}`,
    screen ? `They are looking at: ${screen}.` : "",
    "Answer only from the tools. Never invent a contact, number, or date. If a tool returns nothing, say so plainly. Keep answers short: lead with the answer, then the two or three most useful specifics. Use plain sentences, no headers. When you list records, include names and one identifying detail each.",
    settings.aiAutoAct
      ? "Low-risk writes (new contacts, notes, tags, tasks, deals, bookings) run immediately when you call the tool; the result tells you what happened, so confirm it plainly. Other writes (editing a contact, moving a deal, enrolling in a workflow) are proposals the teammate must approve. Prefer a read tool first when you need an id."
      : "Writes (creating, updating, booking, tagging, enrolling) are proposals: call the tool once with complete arguments and the app will ask the teammate to approve before anything changes. Do not claim a write happened. Prefer a read tool first when you need an id.",
    "Refer to people by their display name. Money is in US dollars. Dates in the company timezone.",
  ].filter(Boolean).join("\n");
}

const toolDefs = () => TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));

async function callModel(body: Record<string, unknown>, beta?: string) {
  const key = apiKey(); if (!key) throw new Error("Cyncro AI isn't switched on for this deployment yet (no AI key on the server).");
  const r = await fetch(`${baseUrl()}/v1/messages`, { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json", ...(beta ? { "anthropic-beta": beta } : {}) }, body: JSON.stringify(body) });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) { const err = (data.error as { message?: string } | undefined)?.message || `AI request failed (${r.status})`; throw new Error(err); }
  return data as { content: Block[]; stop_reason: string; usage?: { input_tokens?: number; output_tokens?: number } };
}

/** One conversational turn. Reads run inline; the first write stops the turn as a pending action. */
export async function ask(tenant: TenantContext, message: string, screen = "", via: "assistant" | "sms" = "assistant"): Promise<AssistantReply> {
  const text = message.trim().slice(0, 4000);
  if (!text) throw new Error("Say something first.");
  const usage = await usageFor(tenant.tenantId);
  if (usage.cap && usage.calls >= usage.cap) throw new Error(`This company has used its ${usage.cap} Cyncro AI requests for ${usage.month}. An owner can raise the cap in Team Access → Company profile.`);
  const ctx: ToolCtx = { ...tenant, via: "assistant" };
  const autoAct = (await companySettings(tenant.tenantId)).aiAutoAct;
  const past = await history(tenant, 24);
  const messages: Msg[] = [];
  for (const h of past) { if (h.role === "user" || h.role === "assistant") { const last = messages[messages.length - 1]; if (last && last.role === h.role && typeof last.content === "string") last.content += `\n\n${h.content}`; else messages.push({ role: h.role, content: h.content }); } }
  if (messages.length && messages[0].role !== "user") messages.shift();
  messages.push({ role: "user", content: text });
  await remember(tenant, "user", text);

  const servers = await mcpServers(tenant.tenantId);
  const tools: unknown[] = [...toolDefs(), ...servers.map((s) => ({ type: "mcp_toolset", mcp_server_name: s.name }))];
  const system = await systemPrompt(tenant, screen);
  const base: Record<string, unknown> = { model: MODEL(), max_tokens: 2000, system, tools, output_config: { effort: "low" } };
  if (servers.length) base.mcp_servers = servers;
  const beta = servers.length ? "mcp-client-2025-11-20" : undefined;

  const toolCalls: string[] = []; const pending: PendingAction[] = []; const acted: AssistantReply["acted"] = []; let reply = ""; let inTok = 0, outTok = 0;
  for (let round = 0; round < 8; round++) {
    const res = await callModel({ ...base, messages }, beta);
    inTok += Number(res.usage?.input_tokens || 0); outTok += Number(res.usage?.output_tokens || 0);
    const texts = res.content.filter((b) => b.type === "text").map((b) => String(b.text || "")).join("\n").trim();
    if (texts) reply = reply ? `${reply}\n\n${texts}` : texts;
    const uses = res.content.filter((b) => b.type === "tool_use") as (Block & { id: string; name: string; input: Record<string, unknown> })[];
    if (res.stop_reason !== "tool_use" || !uses.length) break;
    messages.push({ role: "assistant", content: res.content });
    const results: Block[] = [];
    let stop = false;
    for (const u of uses) {
      const tool = toolByName(u.name);
      if (tool?.kind === "write" && autoAct && tool.risk === "low") {
        // The company lets Cyncro act on low-risk writes: do it now, log it, tell the model what happened.
        const summary = describeAction(u.name, u.input || {}); const id = crypto.randomUUID();
        toolCalls.push(u.name);
        let out: unknown; let ok = true;
        try { out = await runTool(ctx, u.name, u.input || {}); ok = !(out && typeof out === "object" && "error" in (out as Record<string, unknown>)); } catch (e) { out = { error: e instanceof Error ? e.message : "failed" }; ok = false; }
        await coreDb().prepare("INSERT INTO ai_pending_actions (id, tenant_id, user_email, tool, input, summary, status, result, auto, via, created_at, resolved_at) VALUES (?,?,?,?,?,?,?,?,1,?,?,?)").bind(id, tenant.tenantId, tenant.email, u.name, JSON.stringify(u.input || {}), summary, ok ? "DONE" : "FAILED", JSON.stringify(out).slice(0, 4000), via, now(), now()).run();
        acted.push({ id, summary, ok });
        results.push({ type: "tool_result", tool_use_id: u.id, content: `${ok ? "Done" : "Failed"}: ${summary}. Result: ${JSON.stringify(out).slice(0, 4000)}` });
      } else if (tool?.kind === "write") {
        const summary = describeAction(u.name, u.input || {});
        const id = crypto.randomUUID();
        await coreDb().prepare("INSERT INTO ai_pending_actions (id, tenant_id, user_email, tool, input, summary, status, via, created_at) VALUES (?,?,?,?,?,?,'PENDING',?,?)").bind(id, tenant.tenantId, tenant.email, u.name, JSON.stringify(u.input || {}), summary, via, now()).run();
        pending.push({ id, tool: u.name, input: u.input || {}, summary, created_at: now() });
        results.push({ type: "tool_result", tool_use_id: u.id, content: `Proposed to the teammate for approval: ${summary}. Tell them it is waiting for their approval; do not say it is done.` });
        stop = true;
      } else {
        toolCalls.push(u.name);
        const out = await runTool(ctx, u.name, u.input || {});
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out).slice(0, 20000) });
      }
    }
    messages.push({ role: "user", content: results });
    if (stop) {
      const res2 = await callModel({ ...base, messages, tool_choice: { type: "none" } }, beta);
      inTok += Number(res2.usage?.input_tokens || 0); outTok += Number(res2.usage?.output_tokens || 0);
      const t2 = res2.content.filter((b) => b.type === "text").map((b) => String(b.text || "")).join("\n").trim();
      if (t2) reply = reply ? `${reply}\n\n${t2}` : t2;
      break;
    }
  }
  if (!reply) reply = pending.length ? "I've queued that for your approval below." : acted.length ? acted.map((a) => `${a.ok ? "Done" : "Couldn't do"}: ${a.summary}`).join("\n") : "I couldn't find anything for that.";
  await bump(tenant.tenantId, inTok, outTok);
  await remember(tenant, "assistant", reply + (pending.length ? `\n\n(Proposed: ${pending.map((p) => p.summary).join("; ")})` : "") + (acted.length ? `\n\n(Did: ${acted.map((a) => a.summary).join("; ")})` : ""));
  const after = await usageFor(tenant.tenantId);
  return { reply, pending, acted, usage: { calls: after.calls, cap: after.cap }, toolCalls };
}

/** Teammate approved a pending write: run it now with their identity, no model in the loop. */
export async function approve(tenant: TenantContext, actionId: string): Promise<{ summary: string; result: unknown }> {
  const db = coreDb();
  const row = await db.prepare("SELECT * FROM ai_pending_actions WHERE id=? AND tenant_id=? AND user_email=? AND status='PENDING'").bind(actionId, tenant.tenantId, tenant.email).first<Record<string, unknown>>();
  if (!row) throw new Error("That action is no longer pending.");
  const result = await runTool({ ...tenant, via: "assistant" }, String(row.tool), JSON.parse(String(row.input)));
  const failed = Boolean(result && typeof result === "object" && "error" in (result as Record<string, unknown>));
  await db.prepare("UPDATE ai_pending_actions SET status=?, result=?, resolved_at=? WHERE id=?").bind(failed ? "FAILED" : "DONE", JSON.stringify(result).slice(0, 4000), now(), actionId).run();
  await remember(tenant, "assistant", failed ? `Could not do: ${row.summary} — ${(result as { error: string }).error}` : `Done: ${row.summary}`);
  return { summary: String(row.summary), result };
}
export async function dismiss(tenant: TenantContext, actionId: string) {
  await coreDb().prepare("UPDATE ai_pending_actions SET status='DISMISSED', resolved_at=? WHERE id=? AND tenant_id=? AND user_email=? AND status='PENDING'").bind(now(), actionId, tenant.tenantId, tenant.email).run();
}
