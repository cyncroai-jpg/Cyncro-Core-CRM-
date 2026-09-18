import { cleanText, coreDb, hasCrmAction, hasModuleAccess } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";

export async function GET(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "Access required." }, { status: 403 });
    const db = coreDb();
    const { results } = await db.prepare(`SELECT c.*,
      COALESCE((SELECT COUNT(*) FROM gi_events e WHERE e.campaign=c.utm_campaign AND e.event_type='crm.contact_created'),0) AS leads,
      COALESCE((SELECT SUM(e.event_value_cents) FROM gi_events e WHERE e.campaign=c.utm_campaign AND e.event_type IN ('payment.completed','revenue.recorded')),0) AS revenue_cents
      FROM gi_campaigns c ORDER BY c.created_at DESC`).all();
    return Response.json({ campaigns: results });
  } catch (error) {
    console.error("growth.campaigns.list_failed", error);
    return Response.json({ error: "Unable to load campaigns." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "create"))) return Response.json({ error: "Create permission is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    if (!name) return Response.json({ error: "Campaign name is required." }, { status: 400 });
    const db = coreDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO gi_campaigns (id, name, channel, utm_campaign, spend_cents, status, starts_at, ends_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, name, cleanText(body.channel, 40).toUpperCase() || "OTHER", cleanText(body.utmCampaign, 120) || name.toLowerCase().replace(/\s+/g, "-"),
        Math.max(0, Math.round(Number(body.spend || 0) * 100)), "ACTIVE", cleanText(body.startsAt, 20) || null, cleanText(body.endsAt, 20) || null, now, now).run();
    const campaign = await db.prepare("SELECT * FROM gi_campaigns WHERE id=?").bind(id).first();
    return Response.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error("growth.campaigns.create_failed", error);
    return Response.json({ error: "Unable to create campaign." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "edit"))) return Response.json({ error: "Edit permission is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Campaign id is required." }, { status: 400 });
    const updates = (body.updates && typeof body.updates === "object" ? body.updates : {}) as Record<string, unknown>;
    const fields: string[] = []; const values: unknown[] = [];
    const add = (column: string, value: unknown) => { fields.push(`${column} = ?`); values.push(value); };
    if (updates.spend !== undefined) add("spend_cents", Math.max(0, Math.round(Number(updates.spend) * 100)));
    if (updates.status !== undefined) add("status", cleanText(updates.status, 20).toUpperCase());
    if (!fields.length) return Response.json({ error: "No valid changes supplied." }, { status: 400 });
    add("updated_at", new Date().toISOString()); values.push(id);
    const db = coreDb();
    await db.prepare(`UPDATE gi_campaigns SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    const campaign = await db.prepare("SELECT * FROM gi_campaigns WHERE id=?").bind(id).first();
    return campaign ? Response.json({ campaign }) : Response.json({ error: "Campaign not found." }, { status: 404 });
  } catch (error) {
    console.error("growth.campaigns.update_failed", error);
    return Response.json({ error: "Unable to update campaign." }, { status: 500 });
  }
}
