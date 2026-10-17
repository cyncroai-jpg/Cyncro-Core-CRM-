import { coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/tenantAuth";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const db = coreDb();
    const [summary, reps] = await Promise.all([
      db.prepare(`SELECT COUNT(DISTINCT a.id) AS accounts, COUNT(DISTINCT c.id) AS contacts,
        COUNT(DISTINCT o.id) AS opportunities, COALESCE(SUM(CASE WHEN o.stage NOT IN ('CLOSED WON','CLOSED LOST') THEN o.value_cents ELSE 0 END),0) AS pipeline_cents,
        COALESCE(SUM(CASE WHEN o.stage = 'CLOSED WON' THEN o.value_cents ELSE 0 END),0) AS won_cents,
        COALESCE(SUM(CASE WHEN o.stage = 'CLOSED WON' THEN CAST(o.value_cents * o.commission_rate_bps AS INTEGER) / 10000 ELSE 0 END),0) AS commission_cents
        FROM crm_accounts a LEFT JOIN crm_contacts c ON c.account_id = a.id LEFT JOIN crm_opportunities o ON o.account_id = a.id WHERE a.tenant_id = ?`).bind(tenant.tenantId).first(),
      db.prepare(`SELECT COALESCE(assigned_rep,'Unassigned') AS rep, COUNT(*) AS accounts,
        SUM(CASE WHEN stage = 'CLOSED WON' THEN 1 ELSE 0 END) AS won,
        COALESCE(SUM(CASE WHEN stage = 'CLOSED WON' THEN value_cents ELSE 0 END),0) AS revenue_cents,
        COALESCE(SUM(CASE WHEN stage = 'CLOSED WON' THEN CAST(value_cents * commission_rate_bps AS INTEGER) / 10000 ELSE 0 END),0) AS commission_cents
        FROM crm_opportunities WHERE tenant_id = ? GROUP BY assigned_rep ORDER BY revenue_cents DESC`).bind(tenant.tenantId).all(),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const field = await db.prepare("SELECT COUNT(*) AS jobs_today, SUM(CASE WHEN status IN ('EN_ROUTE','IN PROGRESS') THEN 1 ELSE 0 END) AS techs_out, SUM(CASE WHEN status='COMPLETE' THEN revenue_cents ELSE 0 END) AS done_cents FROM dispatch_jobs WHERE tenant_id=? AND substr(scheduled_at,1,10)=?").bind(tenant.tenantId, today).first<{ jobs_today: number; techs_out: number; done_cents: number }>();
    const dealer = await db.prepare("SELECT (SELECT COUNT(*) FROM auto_deals WHERE tenant_id=? AND status NOT IN ('FUNDED','DELIVERED','LOST','DEAD')) AS deals_open, (SELECT COUNT(*) FROM auto_deals WHERE tenant_id=? AND status='FUNDED' AND substr(updated_at,1,10)=?) AS funded_today, (SELECT COALESCE(SUM(sale_price_cents),0) FROM auto_deals WHERE tenant_id=? AND status='FUNDED' AND substr(updated_at,1,10)=?) AS funded_cents, (SELECT COUNT(*) FROM service_repair_orders WHERE tenant_id=? AND status NOT IN ('CLOSED','INVOICED')) AS ros_open").bind(tenant.tenantId, tenant.tenantId, today, tenant.tenantId, today, tenant.tenantId).first<{ deals_open: number; funded_today: number; funded_cents: number; ros_open: number }>().catch(() => null);
    return Response.json({ summary: { ...(summary as Record<string, unknown>), deals_open: Number(dealer?.deals_open || 0), funded_today: Number(dealer?.funded_today || 0), funded_cents: Number(dealer?.funded_cents || 0), ros_open: Number(dealer?.ros_open || 0), jobs_today: Number(field?.jobs_today || 0), techs_out: Number(field?.techs_out || 0), field_done_cents: Number(field?.done_cents || 0) }, reps: reps.results });
  } catch (error) {
    console.error("crm.stats.failed", error);
    return Response.json({ error: "Unable to load CRM statistics." }, { status: 500 });
  }
}
