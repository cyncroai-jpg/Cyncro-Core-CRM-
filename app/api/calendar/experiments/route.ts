/**
 * A/B Slot Experimentation Engine — Cyncro Universal Calendar™
 *
 * Lets you test different slot-presentation strategies (slot count, ordering,
 * SmartSlot™ on vs off) to see which converts more bookings.
 *
 * Assignment is deterministic: a hash of customer email mod 100 gives a
 * stable bucket so the same visitor always sees the same variant.
 *
 * GET  /api/calendar/experiments          — list experiments (admin)
 * GET  /api/calendar/experiments?assign=1&experimentId=X&customerEmail=Y
 *                                         — assign variant (public, idempotent)
 * POST /api/calendar/experiments          — create experiment (admin)
 * POST /api/calendar/experiments?track=1  — record impression or conversion (public)
 * PATCH /api/calendar/experiments         — update experiment (admin)
 */
import { cleanText, coreDb, ensureCoreSchema, hasModuleAccess, normalizeEmail, requestUser } from "@/lib/core/db";

/** Stable deterministic bucket 0–99 from any string */
async function emailBucket(email: string): Promise<number> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(email.toLowerCase().trim()));
  const view = new DataView(hash);
  return view.getUint32(0, false) % 100;
}

/** Assign a variant from the experiment's traffic_split based on bucket */
function assignVariant(trafficSplit: Record<string, number>, bucket: number): string {
  let cumulative = 0;
  const entries = Object.entries(trafficSplit);
  for (const [variant, pct] of entries) {
    cumulative += pct;
    if (bucket < cumulative) return variant;
  }
  // Fallback: last variant or control
  return entries[entries.length - 1]?.[0] ?? "control";
}

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const url = new URL(request.url);

    // Public: assign a variant for a visitor
    if (url.searchParams.get("assign") === "1") {
      const experimentId = cleanText(url.searchParams.get("experimentId"), 80);
      const customerEmail = normalizeEmail(url.searchParams.get("customerEmail"));
      if (!experimentId || !customerEmail) return Response.json({ error: "experimentId and customerEmail are required." }, { status: 400 });
      const db = coreDb();
      const exp = await db.prepare("SELECT * FROM calendar_ab_experiments WHERE id = ? AND active = 1").bind(experimentId).first<Record<string, unknown>>();
      if (!exp) return Response.json({ error: "Experiment not found or inactive." }, { status: 404 });
      let trafficSplit: Record<string, number> = {};
      let variants: string[] = [];
      try { trafficSplit = JSON.parse(String(exp.traffic_split || "{}")); } catch { /* ignore */ }
      try { variants = JSON.parse(String(exp.variants || "[]")); } catch { /* ignore */ }
      // Default equal split if not configured
      if (!Object.keys(trafficSplit).length && variants.length) {
        const pct = Math.floor(100 / variants.length);
        variants.forEach((v, i) => { trafficSplit[v] = i < variants.length - 1 ? pct : 100 - pct * (variants.length - 1); });
      }
      const bucket = await emailBucket(customerEmail);
      const variant = assignVariant(trafficSplit, bucket);
      return Response.json({ experimentId, variant, bucket });
    }

    // Admin: results with conversion rates
    if (url.searchParams.get("results") === "1") {
      if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
      const experimentId = cleanText(url.searchParams.get("experimentId"), 80);
      if (!experimentId) return Response.json({ error: "experimentId is required." }, { status: 400 });
      const db = coreDb();
      const { results: impressions } = await db.prepare(
        `SELECT variant, COUNT(*) AS total FROM calendar_ab_events WHERE experiment_id = ? AND event_type = 'IMPRESSION' GROUP BY variant`
      ).bind(experimentId).all<{ variant: string; total: number }>();
      const { results: conversions } = await db.prepare(
        `SELECT variant, COUNT(*) AS total FROM calendar_ab_events WHERE experiment_id = ? AND event_type = 'CONVERSION' GROUP BY variant`
      ).bind(experimentId).all<{ variant: string; total: number }>();
      const impMap: Record<string, number> = {};
      const convMap: Record<string, number> = {};
      impressions.forEach(r => { impMap[r.variant] = Number(r.total); });
      conversions.forEach(r => { convMap[r.variant] = Number(r.total); });
      const allVariants = [...new Set([...Object.keys(impMap), ...Object.keys(convMap)])];
      const stats = allVariants.map(v => {
        const imp = impMap[v] || 0;
        const conv = convMap[v] || 0;
        const rate = imp > 0 ? Math.round((conv / imp) * 10000) / 100 : 0;
        return { variant: v, impressions: imp, conversions: conv, conversionRate: rate };
      }).sort((a, b) => b.conversionRate - a.conversionRate);
      // Simple statistical significance: z-test vs first variant (control)
      const control = stats[0];
      const withSignificance = stats.map((s, i) => {
        if (i === 0 || !control || control.impressions < 30 || s.impressions < 30) return { ...s, significant: false, lift: 0 };
        const p1 = control.conversionRate / 100;
        const p2 = s.conversionRate / 100;
        const se = Math.sqrt((p1 * (1 - p1)) / control.impressions + (p2 * (1 - p2)) / s.impressions);
        const z = se > 0 ? Math.abs(p2 - p1) / se : 0;
        const lift = p1 > 0 ? Math.round(((p2 - p1) / p1) * 1000) / 10 : 0;
        return { ...s, significant: z >= 1.96, lift, z: Math.round(z * 100) / 100 };
      });
      return Response.json({ experimentId, results: withSignificance });
    }

    // Admin: list experiments
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
    const { results } = await coreDb().prepare(
      "SELECT e.*, t.name AS event_type_name FROM calendar_ab_experiments e LEFT JOIN calendar_event_types t ON t.id = e.event_type_id ORDER BY e.created_at DESC LIMIT 50"
    ).all();
    return Response.json({ experiments: results });
  } catch (error) {
    console.error("calendar.experiments.list_failed", error);
    return Response.json({ error: "Unable to load experiments." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const url = new URL(request.url);
    const db = coreDb();

    // Public tracking: record impression or conversion
    if (url.searchParams.get("track") === "1") {
      const body = (await request.json()) as Record<string, unknown>;
      const experimentId = cleanText(body.experimentId, 80);
      const variant = cleanText(body.variant, 80);
      const customerEmail = normalizeEmail(body.customerEmail);
      const eventType = cleanText(body.eventType, 30).toUpperCase() || "IMPRESSION";
      if (!experimentId || !variant || !customerEmail) return Response.json({ error: "experimentId, variant, and customerEmail are required." }, { status: 400 });
      if (!new Set(["IMPRESSION", "CONVERSION"]).has(eventType)) return Response.json({ error: "eventType must be IMPRESSION or CONVERSION." }, { status: 400 });
      await db.prepare(`INSERT INTO calendar_ab_events (id, experiment_id, variant, customer_email, event_type, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), experimentId, variant, customerEmail, eventType, new Date().toISOString()).run();
      return Response.json({ tracked: true });
    }

    // Admin: create experiment
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    if (!name) return Response.json({ error: "Experiment name is required." }, { status: 400 });
    const variants: string[] = Array.isArray(body.variants) ? (body.variants as unknown[]).map(String).filter(Boolean) : ["control", "treatment"];
    if (variants.length < 2) return Response.json({ error: "At least 2 variants are required." }, { status: 400 });
    // Build equal traffic split if not supplied
    let trafficSplit: Record<string, number> = {};
    if (body.trafficSplit && typeof body.trafficSplit === "object" && !Array.isArray(body.trafficSplit)) {
      trafficSplit = body.trafficSplit as Record<string, number>;
    } else {
      const pct = Math.floor(100 / variants.length);
      variants.forEach((v, i) => { trafficSplit[v] = i < variants.length - 1 ? pct : 100 - pct * (variants.length - 1); });
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO calendar_ab_experiments
      (id, name, event_type_id, variants, traffic_split, active, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`)
      .bind(id, name, cleanText(body.eventTypeId, 80) || null, JSON.stringify(variants), JSON.stringify(trafficSplit), requestUser(request), now, now).run();
    return Response.json({ id, variants, trafficSplit }, { status: 201 });
  } catch (error) {
    console.error("calendar.experiments.create_failed", error);
    return Response.json({ error: "Unable to create experiment." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Experiment id is required." }, { status: 400 });
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => { fields.push(`${col} = ?`); values.push(val); };
    if (body.name !== undefined) add("name", cleanText(body.name, 160));
    if (body.active !== undefined) add("active", body.active ? 1 : 0);
    if (Array.isArray(body.variants)) add("variants", JSON.stringify(body.variants));
    if (body.trafficSplit && typeof body.trafficSplit === "object") add("traffic_split", JSON.stringify(body.trafficSplit));
    if (!fields.length) return Response.json({ error: "No valid changes supplied." }, { status: 400 });
    add("updated_at", new Date().toISOString());
    values.push(id);
    await coreDb().prepare(`UPDATE calendar_ab_experiments SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    const exp = await coreDb().prepare("SELECT * FROM calendar_ab_experiments WHERE id = ?").bind(id).first();
    return exp ? Response.json({ experiment: exp }) : Response.json({ error: "Experiment not found." }, { status: 404 });
  } catch (error) {
    console.error("calendar.experiments.update_failed", error);
    return Response.json({ error: "Unable to update experiment." }, { status: 500 });
  }
}
