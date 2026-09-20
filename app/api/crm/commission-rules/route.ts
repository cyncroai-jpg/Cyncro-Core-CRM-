import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant, requireTenantAction } from "@/lib/core/tenantAuth";

const defaults = [
  ["Automation · starter", "Deals collected under $5,000", 2000],
  ["Automation · growth", "Deals collected from $5,000 to $9,999", 2500],
  ["Automation · premium", "Deals collected at $10,000 or more", 3000],
  ["Website / landing page", "First month only; automations excluded", 5000],
] as const;

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    if (tenant.role !== "OWNER") return Response.json({ error: "Owner access required." }, { status: 403 });
    const db = coreDb();
    const count = await db.prepare("SELECT COUNT(*) AS count FROM crm_commission_rules WHERE tenant_id=?").bind(tenant.tenantId).first<{ count: number }>();
    if (!Number(count?.count || 0)) {
      const now = new Date().toISOString();
      await db.batch(defaults.map((rule, index) => db.prepare("INSERT INTO crm_commission_rules (id,service_name,applies_to,percentage_bps,active,sort_order,tenant_id,created_at,updated_at) VALUES (?,?,?,?,1,?,?,?,?)").bind(crypto.randomUUID(), rule[0], rule[1], rule[2], index, tenant.tenantId, now, now)));
    }
    const result = await db.prepare("SELECT * FROM crm_commission_rules WHERE tenant_id=? ORDER BY sort_order,created_at").bind(tenant.tenantId).all();
    return Response.json({ rules: result.results });
  } catch (error) {
    console.error("commission_rules.list_failed", error);
    return Response.json({ error: "Commission rules could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    if (tenant.role !== "OWNER") return Response.json({ error: "Owner access required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const serviceName = cleanText(body.serviceName, 160), appliesTo = cleanText(body.appliesTo, 500);
    const percentage = Math.min(100, Math.max(0, Number(body.percentage || 0)));
    if (!serviceName || !appliesTo) return Response.json({ error: "Service name and what it applies to are required." }, { status: 400 });
    const id = crypto.randomUUID(), now = new Date().toISOString();
    await coreDb().prepare("INSERT INTO crm_commission_rules (id,service_name,applies_to,percentage_bps,active,sort_order,tenant_id,created_at,updated_at) VALUES (?,?,?,?,1,?,?,?,?)").bind(id, serviceName, appliesTo, Math.round(percentage * 100), Number(body.sortOrder || 99), tenant.tenantId, now, now).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("commission_rules.create_failed", error);
    return Response.json({ error: "Commission rule could not be created." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    if (tenant.role !== "OWNER") return Response.json({ error: "Owner access required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const id = cleanText(body.id, 80), serviceName = cleanText(body.serviceName, 160), appliesTo = cleanText(body.appliesTo, 500);
    const percentage = Math.min(100, Math.max(0, Number(body.percentage || 0)));
    if (!id || !serviceName || !appliesTo) return Response.json({ error: "Complete every rule field." }, { status: 400 });
    await coreDb().prepare("UPDATE crm_commission_rules SET service_name=?,applies_to=?,percentage_bps=?,active=?,updated_at=? WHERE id=? AND tenant_id=?").bind(serviceName, appliesTo, Math.round(percentage * 100), body.active === false ? 0 : 1, new Date().toISOString(), id, tenant.tenantId).run();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("commission_rules.update_failed", error);
    return Response.json({ error: "Commission rule could not be updated." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    if (tenant.role !== "OWNER") return Response.json({ error: "Owner access required." }, { status: 403 });
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Rule ID required." }, { status: 400 });
    await coreDb().prepare("DELETE FROM crm_commission_rules WHERE id=? AND tenant_id=?").bind(id, tenant.tenantId).run();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("commission_rules.delete_failed", error);
    return Response.json({ error: "Commission rule could not be deleted." }, { status: 500 });
  }
}
