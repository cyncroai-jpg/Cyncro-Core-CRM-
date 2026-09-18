import { cleanText, coreDb, hasCrmAction, hasModuleAccess, requestUser } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";

/** Two-proportion z-test — used so a winner is never declared without real statistical evidence. */
function significance(convA: number, totalA: number, convB: number, totalB: number): { pValue: number; significant: boolean } {
  if (totalA < 30 || totalB < 30) return { pValue: 1, significant: false };
  const pA = convA / totalA; const pB = convB / totalB;
  const pooled = (convA + convB) / (totalA + totalB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / totalA + 1 / totalB));
  if (se === 0) return { pValue: 1, significant: false };
  const z = Math.abs(pA - pB) / se;
  // Two-tailed normal approximation
  const pValue = 2 * (1 - normalCdf(z));
  return { pValue, significant: pValue < 0.05 };
}
/** Standard normal CDF via Abramowitz & Stegun 7.1.26 erf approximation (max error ~1.5e-7). */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

export async function GET(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "Access required." }, { status: 403 });
    const db = coreDb();
    const { results: experiments } = await db.prepare("SELECT * FROM gi_experiments ORDER BY created_at DESC").all<Record<string, unknown>>();
    const withStats = await Promise.all((experiments || []).map(async (exp) => {
      const rows = await db.prepare(`SELECT variant, event_type, COUNT(*) AS count, COALESCE(SUM(value_cents),0) AS value_cents FROM gi_experiment_events WHERE experiment_id=? GROUP BY variant, event_type`).bind(exp.id).all<{ variant: string; event_type: string; count: number; value_cents: number }>();
      const stat = (variant: string, type: string) => (rows.results || []).find((r) => r.variant === variant && r.event_type === type)?.count || 0;
      const viewsA = stat("A", "VIEW"), convA = stat("A", "CONVERSION"), viewsB = stat("B", "VIEW"), convB = stat("B", "CONVERSION");
      const sig = significance(convA, viewsA, convB, viewsB);
      return { ...exp, stats: { viewsA, convA, viewsB, convB, rateA: viewsA ? convA / viewsA : 0, rateB: viewsB ? convB / viewsB : 0, ...sig } };
    }));
    return Response.json({ experiments: withStats });
  } catch (error) {
    console.error("growth.experiments.list_failed", error);
    return Response.json({ error: "Unable to load experiments." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "create"))) return Response.json({ error: "Create permission is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    const targetType = cleanText(body.targetType, 40).toUpperCase();
    if (!name || !["FORM", "LANDING_PAGE"].includes(targetType)) return Response.json({ error: "Name and a valid targetType (FORM or LANDING_PAGE) are required." }, { status: 400 });
    const db = coreDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO gi_experiments (id, name, target_type, target_id, variant_a_json, variant_b_json, status, started_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(id, name, targetType, cleanText(body.targetId, 80) || null, JSON.stringify(body.variantA || {}), JSON.stringify(body.variantB || {}), "RUNNING", now, now).run();
    const experiment = await db.prepare("SELECT * FROM gi_experiments WHERE id=?").bind(id).first();
    void requestUser(request);
    return Response.json({ experiment }, { status: 201 });
  } catch (error) {
    console.error("growth.experiments.create_failed", error);
    return Response.json({ error: "Unable to create experiment." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "edit"))) return Response.json({ error: "Edit permission is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Experiment id is required." }, { status: 400 });
    const status = cleanText(body.status, 20).toUpperCase();
    if (!["RUNNING", "PAUSED", "COMPLETE"].includes(status)) return Response.json({ error: "Invalid status." }, { status: 400 });
    const db = coreDb();
    const now = new Date().toISOString();
    if (status === "COMPLETE") {
      const winner = cleanText(body.winner, 10);
      await db.prepare("UPDATE gi_experiments SET status=?, winner=?, ended_at=? WHERE id=?").bind(status, winner || null, now, id).run();
    } else {
      await db.prepare("UPDATE gi_experiments SET status=? WHERE id=?").bind(status, id).run();
    }
    const experiment = await db.prepare("SELECT * FROM gi_experiments WHERE id=?").bind(id).first();
    return experiment ? Response.json({ experiment }) : Response.json({ error: "Experiment not found." }, { status: 404 });
  } catch (error) {
    console.error("growth.experiments.update_failed", error);
    return Response.json({ error: "Unable to update experiment." }, { status: 500 });
  }
}
