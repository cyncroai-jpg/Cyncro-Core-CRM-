/** Public: records a real VIEW or CONVERSION for one variant of a running experiment. */
import { coreDb, cleanText } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";

export async function POST(request: Request) {
  try {
    await ensureGrowthSchema();
    const body = (await request.json()) as { experimentId?: string; variant?: string; eventType?: string; valueCents?: number };
    const experimentId = cleanText(body.experimentId, 80);
    const variant = cleanText(body.variant, 4).toUpperCase();
    const eventType = cleanText(body.eventType, 20).toUpperCase();
    if (!experimentId || !["A", "B"].includes(variant) || !["VIEW", "CONVERSION"].includes(eventType)) {
      return Response.json({ error: "experimentId, variant (A/B), and eventType (VIEW/CONVERSION) are required." }, { status: 400 });
    }
    const db = coreDb();
    const experiment = await db.prepare("SELECT id, status FROM gi_experiments WHERE id=?").bind(experimentId).first<{ id: string; status: string }>();
    if (!experiment || experiment.status !== "RUNNING") return Response.json({ error: "This experiment is not running." }, { status: 404 });
    await db.prepare("INSERT INTO gi_experiment_events (id, experiment_id, variant, event_type, value_cents, created_at) VALUES (?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), experimentId, variant, eventType, Math.max(0, Math.round(body.valueCents || 0)), new Date().toISOString()).run();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("growth.experiments.track_failed", error);
    return Response.json({ error: "Unable to record experiment event." }, { status: 500 });
  }
}
