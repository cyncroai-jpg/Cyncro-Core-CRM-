import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { DISPATCH_DENIED, requireDispatch } from "@/lib/dispatch/access";

// Labor cost = sum of (clocked minutes / 60 * technician hourly rate) across all time entries for the job.
async function jobProfitability(tenantId: string, jobId: string) {
  const db = coreDb();
  const job = await db.prepare("SELECT revenue_cents, assigned_tech_id FROM dispatch_jobs WHERE tenant_id=? AND id=?").bind(tenantId, jobId).first<{ revenue_cents: number; assigned_tech_id: string | null }>();
  if (!job) return null;
  const materials = await db.prepare("SELECT COALESCE(SUM(quantity*unit_cost_cents),0) total FROM dispatch_job_materials WHERE job_id=?").bind(jobId).first<{ total: number }>();
  const entries = await db.prepare("SELECT clock_in_at, clock_out_at, tech_id FROM dispatch_job_time_entries WHERE job_id=? AND clock_out_at IS NOT NULL").bind(jobId).all<{ clock_in_at: string; clock_out_at: string; tech_id: string | null }>();
  let laborCents = 0;
  for (const entry of entries.results) {
    const techId = entry.tech_id || job.assigned_tech_id;
    if (!techId) continue;
    const tech = await db.prepare("SELECT hourly_rate_cents FROM dispatch_technicians WHERE id=?").bind(techId).first<{ hourly_rate_cents: number }>();
    const hours = (new Date(entry.clock_out_at).getTime() - new Date(entry.clock_in_at).getTime()) / 3_600_000;
    laborCents += Math.max(0, hours) * (tech?.hourly_rate_cents || 0);
  }
  const materialsCents = Number(materials?.total || 0);
  const revenueCents = job.revenue_cents;
  const profitCents = revenueCents - materialsCents - Math.round(laborCents);
  return { revenueCents, materialsCents, laborCents: Math.round(laborCents), profitCents };
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const url = new URL(request.url);
    const jobId = cleanText(url.searchParams.get("jobId"), 80);
    if (jobId) {
      const profitability = await jobProfitability(t.tenantId, jobId);
      return Response.json({ profitability });
    }
    const { results } = await coreDb().prepare(`
      SELECT i.*, c.name customer_name, j.service_type
      FROM dispatch_invoices i
      LEFT JOIN dispatch_customers c ON c.id=i.customer_id
      LEFT JOIN dispatch_jobs j ON j.id=i.job_id
      WHERE i.tenant_id=?
      ORDER BY i.created_at DESC
    `).bind(t.tenantId).all();
    return Response.json({ invoices: results });
  } catch (error) {
    console.error("dispatch.invoices.list_failed", error);
    return Response.json({ error: "Unable to load invoices." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const body = await request.json() as Record<string, unknown>;
    const jobId = cleanText(body.jobId, 80);
    if (!jobId) return Response.json({ error: "Job id is required." }, { status: 400 });
    const job = await coreDb().prepare("SELECT customer_id, revenue_cents FROM dispatch_jobs WHERE tenant_id=? AND id=?").bind(t.tenantId, jobId).first<{ customer_id: string; revenue_cents: number }>();
    if (!job) return Response.json({ error: "Job not found." }, { status: 404 });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await coreDb().batch([
      coreDb().prepare("INSERT INTO dispatch_invoices (id,tenant_id,job_id,customer_id,amount_cents,status,issued_at,created_at,updated_at) VALUES (?,?,?,?,?,'ISSUED',?,?,?)")
        .bind(id, t.tenantId, jobId, job.customer_id, job.revenue_cents, now, now, now),
      coreDb().prepare("UPDATE dispatch_jobs SET status='INVOICED', updated_at=? WHERE tenant_id=? AND id=?").bind(now, t.tenantId, jobId),
    ]);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("dispatch.invoices.create_failed", error);
    return Response.json({ error: "Unable to create invoice." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireDispatch(request); if (!t) return DISPATCH_DENIED();
    const body = await request.json() as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Invoice id is required." }, { status: 400 });
    if (body.markPaid) {
      await coreDb().prepare("UPDATE dispatch_invoices SET status='PAID', paid_at=?, updated_at=? WHERE tenant_id=? AND id=?")
        .bind(new Date().toISOString(), new Date().toISOString(), t.tenantId, id).run();
      return Response.json({ updated: true });
    }
    return Response.json({ updated: false });
  } catch (error) {
    console.error("dispatch.invoices.update_failed", error);
    return Response.json({ error: "Unable to update invoice." }, { status: 500 });
  }
}
