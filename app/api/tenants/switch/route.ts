/** Switch which company this login opens by default. Only companies the person belongs to. */
import { cleanText, coreDb, ensureCoreSchema, resolveRequestEmail } from "@/lib/core/db";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const email = await resolveRequestEmail(request);
    if (!email || email === "platform-owner") return Response.json({ error: "Sign in first." }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { tenantId?: string };
    const tenantId = cleanText(body.tenantId, 80);
    const m = await coreDb().prepare("SELECT tenant_id FROM tenant_members WHERE tenant_id=? AND lower(email)=lower(?) AND active=1").bind(tenantId, email).first();
    if (!m) return Response.json({ error: "You're not a member of that company." }, { status: 403 });
    await coreDb().prepare("UPDATE auth_users SET default_tenant_id=?, updated_at=? WHERE lower(email)=lower(?)").bind(tenantId, new Date().toISOString(), email).run();
    return Response.json({ switched: true, tenantId });
  } catch (error) { console.error("tenant.switch_failed", error); return Response.json({ error: "Unable to switch company." }, { status: 500 }); }
}
