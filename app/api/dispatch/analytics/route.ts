import { coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";

async function requireDispatchAccess(request: Request) {
  const email = requestUser(request);
  if (email === "platform-owner") return true;
  const member = await coreDb().prepare("SELECT role,active FROM workspace_members WHERE email=?").bind(email).first<{ role: string; active: number }>();
  if (!member) {
    const count = await coreDb().prepare("SELECT COUNT(*) AS c FROM workspace_members").first<{ c: number }>();
    if (!Number(count?.c || 0)) return true;
  }
  return Boolean(member?.active);
}

const MIN_BILLABLE_HOURS = 1 / 60; // entries under a minute are almost certainly a clock mistake, not real time

function hoursBetween(clockIn: string, clockOut: string | null): number {
  if (!clockOut) return 0;
  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const hours = (end - start) / 3_600_000;
  return hours < MIN_BILLABLE_HOURS ? 0 : hours;
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await requireDispatchAccess(request))) return Response.json({ error: "Dispatch access required." }, { status: 403 });
    const db = coreDb();
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [jobsRes, invoicesRes, techsRes, timeRes, materialsRes] = await Promise.all([
      db.prepare("SELECT id,status,revenue_cents,scheduled_at,updated_at,assigned_tech_id FROM dispatch_jobs").all(),
      db.prepare("SELECT id,job_id,amount_cents,status,paid_at FROM dispatch_invoices").all(),
      db.prepare("SELECT id,name,hourly_rate_cents FROM dispatch_technicians WHERE active=1").all(),
      db.prepare("SELECT job_id,tech_id,clock_in_at,clock_out_at FROM dispatch_job_time_entries").all(),
      db.prepare("SELECT job_id,quantity,unit_cost_cents FROM dispatch_job_materials").all(),
    ]);

    const jobs = (jobsRes.results || []) as Record<string, unknown>[];
    const invoices = (invoicesRes.results || []) as Record<string, unknown>[];
    const techs = (techsRes.results || []) as Record<string, unknown>[];
    const timeEntries = (timeRes.results || []) as Record<string, unknown>[];
    const materials = (materialsRes.results || []) as Record<string, unknown>[];

    const bookedThisWeekCents = jobs
      .filter((j) => String(j.scheduled_at) >= since && String(j.status) !== "CANCELLED")
      .reduce((sum, j) => sum + Number(j.revenue_cents || 0), 0);

    const collectedCents = invoices
      .filter((inv) => inv.paid_at && String(inv.paid_at) >= since)
      .reduce((sum, inv) => sum + Number(inv.amount_cents || 0), 0);

    const outstanding = invoices.filter((inv) => String(inv.status) !== "PAID");
    const outstandingCents = outstanding.reduce((sum, inv) => sum + Number(inv.amount_cents || 0), 0);

    const completedThisWeek = jobs.filter(
      (j) => ["COMPLETE", "INVOICED"].includes(String(j.status)) && String(j.updated_at) >= since,
    );
    const completedAll = jobs.filter((j) => ["COMPLETE", "INVOICED"].includes(String(j.status)));

    const materialCostByJob = new Map<string, number>();
    for (const m of materials) {
      const jobId = String(m.job_id);
      const cost = Number(m.quantity || 0) * Number(m.unit_cost_cents || 0);
      materialCostByJob.set(jobId, (materialCostByJob.get(jobId) || 0) + cost);
    }

    const hoursByTech = new Map<string, number>();
    const hoursByJob = new Map<string, number>();
    for (const t of timeEntries) {
      const hrs = hoursBetween(String(t.clock_in_at), t.clock_out_at ? String(t.clock_out_at) : null);
      if (t.tech_id) hoursByTech.set(String(t.tech_id), (hoursByTech.get(String(t.tech_id)) || 0) + hrs);
      if (t.job_id) hoursByJob.set(String(t.job_id), (hoursByJob.get(String(t.job_id)) || 0) + hrs);
    }

    const revenueByTech = new Map<string, number>();
    for (const j of completedAll) {
      if (!j.assigned_tech_id) continue;
      const techId = String(j.assigned_tech_id);
      revenueByTech.set(techId, (revenueByTech.get(techId) || 0) + Number(j.revenue_cents || 0));
    }

    const techProductivity = techs
      .map((t) => {
        const id = String(t.id);
        const hours = hoursByTech.get(id) || 0;
        const revenueCents = revenueByTech.get(id) || 0;
        return {
          id,
          name: String(t.name),
          hours: Math.round(hours * 10) / 10,
          revenueCents,
          revenuePerHourCents: hours >= 0.1 ? Math.round(revenueCents / hours) : null,
        };
      })
      .sort((a, b) => (b.revenuePerHourCents || 0) - (a.revenuePerHourCents || 0));

    const rateByTech = new Map(techs.map((t) => [String(t.id), Number(t.hourly_rate_cents || 0)]));
    let laborCents = 0;
    for (const j of completedAll) {
      const jobHours = hoursByJob.get(String(j.id)) || 0;
      const rate = j.assigned_tech_id ? rateByTech.get(String(j.assigned_tech_id)) || 0 : 0;
      laborCents += jobHours * rate;
    }
    let materialsCents = 0;
    for (const j of completedAll) materialsCents += materialCostByJob.get(String(j.id)) || 0;
    const revenueCents = completedAll.reduce((sum, j) => sum + Number(j.revenue_cents || 0), 0);
    const profitCents = revenueCents - laborCents - materialsCents;
    const marginPct = revenueCents > 0 ? (profitCents / revenueCents) * 100 : 0;

    return Response.json({
      bookedThisWeekCents,
      collectedCents,
      outstandingCents,
      outstandingCount: outstanding.length,
      jobsCompletedThisWeek: completedThisWeek.length,
      techProductivity,
      profitability: {
        revenueCents,
        laborCents: Math.round(laborCents),
        materialsCents: Math.round(materialsCents),
        profitCents: Math.round(profitCents),
        marginPct: Math.round(marginPct * 10) / 10,
        jobsIncluded: completedAll.length,
      },
    });
  } catch (error) {
    console.error("dispatch.analytics.load_failed", error);
    return Response.json({ error: "Unable to load analytics." }, { status: 500 });
  }
}
