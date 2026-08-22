import { coreDb, ensureCoreSchema } from "@/lib/core/db";

export async function GET() {
  try {
    await ensureCoreSchema();
    const db = coreDb();
    const [summary, reps] = await Promise.all([
      db.prepare(`SELECT COUNT(DISTINCT a.id) AS accounts, COUNT(DISTINCT c.id) AS contacts,
        COUNT(DISTINCT o.id) AS opportunities, COALESCE(SUM(CASE WHEN o.stage NOT IN ('CLOSED WON','CLOSED LOST') THEN o.value_cents ELSE 0 END),0) AS pipeline_cents,
        COALESCE(SUM(CASE WHEN o.stage = 'CLOSED WON' THEN o.value_cents ELSE 0 END),0) AS won_cents,
        COALESCE(SUM(CASE WHEN o.stage = 'CLOSED WON' THEN CAST(o.value_cents * o.commission_rate_bps AS INTEGER) / 10000 ELSE 0 END),0) AS commission_cents
        FROM crm_accounts a LEFT JOIN crm_contacts c ON c.account_id = a.id LEFT JOIN crm_opportunities o ON o.account_id = a.id`).first(),
      db.prepare(`SELECT COALESCE(assigned_rep,'Unassigned') AS rep, COUNT(*) AS accounts,
        SUM(CASE WHEN stage = 'CLOSED WON' THEN 1 ELSE 0 END) AS won,
        COALESCE(SUM(CASE WHEN stage = 'CLOSED WON' THEN value_cents ELSE 0 END),0) AS revenue_cents,
        COALESCE(SUM(CASE WHEN stage = 'CLOSED WON' THEN CAST(value_cents * commission_rate_bps AS INTEGER) / 10000 ELSE 0 END),0) AS commission_cents
        FROM crm_opportunities GROUP BY assigned_rep ORDER BY revenue_cents DESC`).all(),
    ]);
    return Response.json({ summary, reps: reps.results });
  } catch (error) {
    console.error("crm.stats.failed", error);
    return Response.json({ error: "Unable to load CRM statistics." }, { status: 500 });
  }
}
