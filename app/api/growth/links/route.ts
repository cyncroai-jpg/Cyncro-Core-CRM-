import { cleanText, coreDb, hasCrmAction, hasModuleAccess, requestUser } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";

export async function GET(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "Access required." }, { status: 403 });
    const db = coreDb();
    const { results } = await db.prepare(`SELECT l.*, COALESCE((SELECT COUNT(*) FROM gi_events e WHERE e.link_id=l.id AND e.event_type='crm.contact_created'),0) AS leads,
      COALESCE((SELECT SUM(e.event_value_cents) FROM gi_events e WHERE e.link_id=l.id AND e.event_type IN ('payment.completed','revenue.recorded')),0) AS revenue_cents
      FROM gi_tracked_links l ORDER BY l.created_at DESC`).all();
    return Response.json({ links: results });
  } catch (error) {
    console.error("growth.links.list_failed", error);
    return Response.json({ error: "Unable to load tracked links." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "create"))) return Response.json({ error: "Create permission is required." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const label = cleanText(body.label, 160);
    const destinationUrl = cleanText(body.destinationUrl, 1000);
    if (!label || !destinationUrl) return Response.json({ error: "Label and destination URL are required." }, { status: 400 });
    try { new URL(destinationUrl); } catch { return Response.json({ error: "Destination must be a valid URL." }, { status: 400 }); }
    const db = coreDb();
    let slug = cleanText(body.slug, 60).toLowerCase().replace(/[^a-z0-9-]/g, "-") || label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const existing = await db.prepare("SELECT id FROM gi_tracked_links WHERE slug=?").bind(slug).first();
    if (existing) slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO gi_tracked_links (id, slug, label, destination_url, campaign_id, source, medium, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(id, slug, label, destinationUrl, cleanText(body.campaignId, 80) || null, cleanText(body.source, 80) || null, cleanText(body.medium, 80) || null, requestUser(request), now).run();
    const link = await db.prepare("SELECT * FROM gi_tracked_links WHERE id=?").bind(id).first();
    return Response.json({ link }, { status: 201 });
  } catch (error) {
    console.error("growth.links.create_failed", error);
    return Response.json({ error: "Unable to create tracked link." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasCrmAction(request, "delete"))) return Response.json({ error: "Delete permission is required." }, { status: 403 });
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) return Response.json({ error: "Link id is required." }, { status: 400 });
    await coreDb().prepare("DELETE FROM gi_tracked_links WHERE id=?").bind(id).run();
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("growth.links.delete_failed", error);
    return Response.json({ error: "Unable to delete link." }, { status: 500 });
  }
}
