import { cleanText, coreDb, ensureCoreSchema, hasModuleAccess } from "@/lib/core/db";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
    const { results } = await coreDb().prepare(
      "SELECT * FROM calendar_routing_rules WHERE active = 1 ORDER BY name"
    ).all();
    return Response.json({ routingRules: results });
  } catch (error) {
    console.error("calendar.routing_rules.list_failed", error);
    return Response.json({ error: "Unable to load routing rules." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    if (!name) return Response.json({ error: "Routing rule name is required." }, { status: 400 });
    const strategy = cleanText(body.strategy, 30).toUpperCase() || "ROUND_ROBIN";
    const validStrategies = new Set(["ROUND_ROBIN", "WEIGHTED", "SKILL", "TERRITORY", "PERFORMANCE", "REVENUE", "AVAILABILITY"]);
    if (!validStrategies.has(strategy)) return Response.json({ error: "Invalid routing strategy." }, { status: 400 });
    const members = Array.isArray(body.members) ? body.members as string[] : [];
    if (!members.length) return Response.json({ error: "At least one team member is required." }, { status: 400 });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await coreDb().prepare(
      `INSERT INTO calendar_routing_rules (id, name, event_type_id, strategy, members, weights, skills_required, territory_rules, active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).bind(
      id, name, cleanText(body.eventTypeId, 80) || null, strategy,
      JSON.stringify(members),
      JSON.stringify(typeof body.weights === "object" && body.weights ? body.weights : {}),
      JSON.stringify(Array.isArray(body.skillsRequired) ? body.skillsRequired : []),
      JSON.stringify(Array.isArray(body.territoryRules) ? body.territoryRules : []),
      "system", now, now
    ).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("calendar.routing_rules.create_failed", error);
    return Response.json({ error: "Unable to create routing rule." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "calendar"))) return Response.json({ error: "Calendar access is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Rule id is required." }, { status: 400 });
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => { fields.push(`${col} = ?`); values.push(val); };
    if (body.name !== undefined) add("name", cleanText(body.name, 160));
    if (body.strategy !== undefined) add("strategy", cleanText(body.strategy, 30).toUpperCase());
    if (Array.isArray(body.members)) add("members", JSON.stringify(body.members));
    if (body.weights !== undefined) add("weights", JSON.stringify(body.weights));
    if (Array.isArray(body.skillsRequired)) add("skills_required", JSON.stringify(body.skillsRequired));
    if (Array.isArray(body.territoryRules)) add("territory_rules", JSON.stringify(body.territoryRules));
    if (body.active !== undefined) add("active", body.active ? 1 : 0);
    if (!fields.length) return Response.json({ error: "No changes provided." }, { status: 400 });
    add("updated_at", new Date().toISOString());
    values.push(id);
    await coreDb().prepare(`UPDATE calendar_routing_rules SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    const rule = await coreDb().prepare("SELECT * FROM calendar_routing_rules WHERE id = ?").bind(id).first();
    return rule ? Response.json({ rule }) : Response.json({ error: "Rule not found." }, { status: 404 });
  } catch (error) {
    console.error("calendar.routing_rules.update_failed", error);
    return Response.json({ error: "Unable to update routing rule." }, { status: 500 });
  }
}

/** Outcome Routing™: resolve the next assigned rep for a given routing rule */
export async function PUT(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const ruleId = cleanText(body.ruleId, 80);
    if (!ruleId) return Response.json({ error: "Rule id is required." }, { status: 400 });
    const db = coreDb();
    const rule = await db.prepare("SELECT * FROM calendar_routing_rules WHERE id = ? AND active = 1").bind(ruleId).first<Record<string, unknown>>();
    if (!rule) return Response.json({ error: "Routing rule not found." }, { status: 404 });
    const members = JSON.parse(String(rule.members || "[]")) as string[];
    if (!members.length) return Response.json({ error: "No team members configured." }, { status: 400 });
    const strategy = String(rule.strategy || "ROUND_ROBIN");
    let assignedTo = members[0];
    if (strategy === "ROUND_ROBIN") {
      // Count recent bookings per member and pick the one with fewest
      const counts: Record<string, number> = {};
      for (const m of members) counts[m] = 0;
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { results } = await db.prepare(
        `SELECT assigned_to, COUNT(*) AS cnt FROM calendar_bookings WHERE assigned_to IN (${members.map(() => "?").join(",")}) AND starts_at >= ? AND status NOT IN ('CANCELLED') GROUP BY assigned_to`
      ).bind(...members, since).all<{ assigned_to: string; cnt: number }>();
      for (const row of results) counts[row.assigned_to] = Number(row.cnt);
      assignedTo = members.reduce((a, b) => counts[a] <= counts[b] ? a : b);
    } else if (strategy === "WEIGHTED") {
      const weights = JSON.parse(String(rule.weights || "{}")) as Record<string, number>;
      const totalWeight = members.reduce((s, m) => s + (weights[m] || 1), 0);
      let rand = Math.random() * totalWeight;
      for (const m of members) { rand -= (weights[m] || 1); if (rand <= 0) { assignedTo = m; break; } }
    }
    return Response.json({ assignedTo, strategy });
  } catch (error) {
    console.error("calendar.routing_rules.resolve_failed", error);
    return Response.json({ error: "Unable to resolve routing." }, { status: 500 });
  }
}
