/** Personal MCP keys: any active teammate can mint a key for themselves. The key carries their identity and role. */
import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/tenantAuth";
import { generateAPIKey } from "@/lib/core/api-keys";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const mine = await coreDb().prepare("SELECT id, name, last_used_at, active, created_at FROM api_keys WHERE tenant_id=? AND lower(member_email)=lower(?) AND active=1 ORDER BY created_at DESC").bind(tenant.tenantId, tenant.email).all();
    const url = `${new URL(request.url).origin}/api/mcp`;
    return Response.json({ keys: mine.results, url });
  } catch (error) { console.error("mcp.keys.get_failed", error); return Response.json({ error: "Unable to load keys." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    if (tenant.role === "VIEWER") return Response.json({ error: "Viewers can't create keys." }, { status: 403 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = cleanText(b.name, 80) || "Claude";
    const count = await coreDb().prepare("SELECT COUNT(*) AS c FROM api_keys WHERE tenant_id=? AND lower(member_email)=lower(?) AND active=1").bind(tenant.tenantId, tenant.email).first<{ c: number }>();
    if (Number(count?.c || 0) >= 5) return Response.json({ error: "You already have 5 active keys. Revoke one first." }, { status: 400 });
    const { key, apiKey } = await generateAPIKey(tenant.tenantId, name, ["*"], 300, undefined, tenant.userId);
    await coreDb().prepare("UPDATE api_keys SET member_email=? WHERE id=?").bind(tenant.email, apiKey.id).run();
    return Response.json({ id: apiKey.id, name, key, url: `${new URL(request.url).origin}/api/mcp` }, { status: 201 });
  } catch (error) { console.error("mcp.keys.post_failed", error); return Response.json({ error: "Unable to create the key." }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    const r = await coreDb().prepare("UPDATE api_keys SET active=0, updated_at=? WHERE id=? AND tenant_id=? AND (lower(member_email)=lower(?) OR ? IN ('OWNER','ADMIN'))").bind(new Date().toISOString(), id, tenant.tenantId, tenant.email, tenant.role).run();
    return Response.json({ revoked: Boolean(r.meta?.changes) });
  } catch (error) { console.error("mcp.keys.delete_failed", error); return Response.json({ error: "Unable to revoke the key." }, { status: 500 }); }
}
