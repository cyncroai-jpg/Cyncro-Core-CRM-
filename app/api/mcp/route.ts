/**
 * Cyncro as an MCP server (Model Context Protocol, Streamable HTTP transport).
 *
 * Point Claude, ChatGPT, Cursor or any MCP client at POST https://<host>/api/mcp
 * with header  Authorization: Bearer <personal key from Team Access>.
 * The key identifies one teammate in one company, so the outside assistant can
 * see and do exactly what that teammate can in the app. Every call is logged.
 *
 * Methods: initialize, notifications/initialized, ping, tools/list, tools/call.
 */
import { coreDb, ensureCoreSchema, type TenantContext } from "@/lib/core/db";
import { validateAPIKey, recordAPIKeyUsage } from "@/lib/core/api-keys";
import { TOOLS, runTool } from "@/lib/ai/tools";

const PROTOCOL = "2025-06-18";
type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const ok = (id: Rpc["id"], result: unknown) => Response.json({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Rpc["id"], code: number, message: string, status = 200) => Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });

async function identify(request: Request): Promise<TenantContext | null> {
  const auth = request.headers.get("authorization") || "";
  const key = auth.replace(/^Bearer\s+/i, "").trim();
  if (!key.startsWith("cyncro_")) return null;
  const v = await validateAPIKey(key);
  if (!v.valid || !v.apiKey) return null;
  const db = coreDb();
  const row = await db.prepare("SELECT member_email, created_by FROM api_keys WHERE id=?").bind(v.apiKey.id).first<{ member_email: string | null; created_by: string | null }>();
  const member = row?.member_email
    ? await db.prepare("SELECT user_id, email, role FROM tenant_members WHERE tenant_id=? AND lower(email)=lower(?) AND active=1").bind(v.apiKey.tenantId, row.member_email).first<{ user_id: string; email: string; role: string }>()
    : await db.prepare("SELECT user_id, email, role FROM tenant_members WHERE tenant_id=? AND user_id=? AND active=1").bind(v.apiKey.tenantId, String(row?.created_by || "")).first<{ user_id: string; email: string; role: string }>();
  if (!member) return null;
  await recordAPIKeyUsage(v.apiKey.keyHash).catch(() => undefined);
  return { tenantId: v.apiKey.tenantId, userId: member.user_id, email: member.email, role: member.role as TenantContext["role"] };
}

export async function GET() {
  return Response.json({ name: "cyncro-core", protocol: PROTOCOL, transport: "streamable-http", how: "POST JSON-RPC to this URL with Authorization: Bearer <key>. Streaming (SSE) is not offered; every call returns a single JSON response." });
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await identify(request);
    if (!tenant) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized: send Authorization: Bearer <your Cyncro key from Team Access>." } }, { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="cyncro"' } });
    const body = (await request.json().catch(() => null)) as Rpc | Rpc[] | null;
    if (!body) return fail(null, -32700, "Parse error", 400);
    const handle = async (m: Rpc): Promise<Response | null> => {
      const id = m.id;
      switch (m.method) {
        case "initialize": return ok(id, { protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "cyncro-core", version: "1.0.0" }, instructions: `You are connected to Cyncro Core as ${tenant.email} (${tenant.role}). Tools read and write this company's CRM, calendar, tasks, dispatch jobs, invoices and automations. Writes take effect immediately; confirm with the user before booking, moving deals or creating records.` });
        case "notifications/initialized": return null;
        case "ping": return ok(id, {});
        case "tools/list": return ok(id, { tools: TOOLS.map((t) => ({ name: t.name, description: `${t.description}${t.kind === "write" ? " (writes data)" : ""}`, inputSchema: t.input_schema, annotations: { readOnlyHint: t.kind === "read", destructiveHint: false, title: t.name.replace(/_/g, " ") } })) });
        case "tools/call": {
          const name = String(m.params?.name || ""); const args = (m.params?.arguments && typeof m.params.arguments === "object" ? m.params.arguments : {}) as Record<string, unknown>;
          if (!TOOLS.some((t) => t.name === name)) return fail(id, -32602, `Unknown tool ${name}`);
          const result = await runTool({ ...tenant, via: "mcp" }, name, args);
          const isErr = Boolean(result && typeof result === "object" && "error" in (result as Record<string, unknown>));
          return ok(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: isErr });
        }
        default: return m.id === undefined ? null : fail(id, -32601, `Method not found: ${m.method}`);
      }
    };
    if (Array.isArray(body)) {
      const out: unknown[] = [];
      for (const m of body) { const r = await handle(m); if (r) out.push(await r.json()); }
      return out.length ? Response.json(out) : new Response(null, { status: 202 });
    }
    const r = await handle(body);
    return r || new Response(null, { status: 202 });
  } catch (error) {
    console.error("mcp.failed", error);
    return fail(null, -32603, "Internal error", 500);
  }
}
