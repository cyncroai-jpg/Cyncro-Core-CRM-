/** Connected apps: outside MCP servers Cyncro AI may call for this company. OWNER/ADMIN manage them. */
import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/tenantAuth";

const admin = (role: string) => role === "OWNER" || role === "ADMIN";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const { results } = await coreDb().prepare("SELECT id, name, url, CASE WHEN auth_token IS NULL OR auth_token='' THEN 0 ELSE 1 END AS has_token, active, created_by, created_at FROM mcp_connections WHERE tenant_id=? ORDER BY created_at").bind(tenant.tenantId).all();
    return Response.json({ connections: results, canEdit: admin(tenant.role) });
  } catch (error) { console.error("ai.connections.get_failed", error); return Response.json({ error: "Unable to load connected apps." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    if (!admin(tenant.role)) return Response.json({ error: "Only an owner or admin can connect apps." }, { status: 403 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = cleanText(b.name, 60); const url = cleanText(b.url, 500); const token = cleanText(b.token, 2000) || null;
    if (!name || !/^https:\/\//.test(url)) return Response.json({ error: "A name and an https:// server URL are required." }, { status: 400 });
    const now = new Date().toISOString(); const id = crypto.randomUUID();
    await coreDb().prepare("INSERT INTO mcp_connections (id, tenant_id, name, url, auth_token, created_by, active, created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?)").bind(id, tenant.tenantId, name, url, token, tenant.email, now, now).run();
    return Response.json({ id, name, url }, { status: 201 });
  } catch (error) { console.error("ai.connections.post_failed", error); return Response.json({ error: "Unable to connect the app." }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    if (!admin(tenant.role)) return Response.json({ error: "Only an owner or admin can remove apps." }, { status: 403 });
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    await coreDb().prepare("DELETE FROM mcp_connections WHERE id=? AND tenant_id=?").bind(id, tenant.tenantId).run();
    return Response.json({ deleted: true });
  } catch (error) { console.error("ai.connections.delete_failed", error); return Response.json({ error: "Unable to remove the app." }, { status: 500 }); }
}
