/** Company settings (timezone, business hours, branding, sender). GET for any member, PATCH for OWNER/ADMIN. */
import { coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/tenantAuth";
import { companySettings, parseSettings } from "@/lib/core/companySettings";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const row = await coreDb().prepare("SELECT id, name, slug, plan, seats, created_at FROM tenants WHERE id=?").bind(tenant.tenantId).first<Record<string, unknown>>();
    return Response.json({ company: row, settings: await companySettings(tenant.tenantId), role: tenant.role, canEdit: tenant.role === "OWNER" || tenant.role === "ADMIN" });
  } catch (error) {
    console.error("tenant.settings.get_failed", error);
    return Response.json({ error: "Unable to load company settings." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    if (tenant.role !== "OWNER" && tenant.role !== "ADMIN") return Response.json({ error: "Only an owner or admin can change company settings." }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const current = await companySettings(tenant.tenantId);
    const next = parseSettings({ ...current, ...(body.settings && typeof body.settings === "object" ? body.settings : {}) });
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 160) : "";
    const now = new Date().toISOString();
    await coreDb().prepare(`UPDATE tenants SET settings_json=?, ${name ? "name=?, " : ""}updated_at=? WHERE id=?`).bind(JSON.stringify(next), ...(name ? [name] : []), now, tenant.tenantId).run();
    return Response.json({ saved: true, settings: next });
  } catch (error) {
    console.error("tenant.settings.patch_failed", error);
    return Response.json({ error: "Unable to save company settings." }, { status: 500 });
  }
}
