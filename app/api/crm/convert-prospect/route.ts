import { cleanText, coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";
import { ensureProspectingSchema } from "@/lib/prospecting/db";

export async function POST(request: Request) {
  try {
    await Promise.all([ensureCoreSchema(), ensureProspectingSchema()]);
    const body = (await request.json()) as Record<string, unknown>;
    const prospectId = cleanText(body.prospectId, 80);
    if (!prospectId) return Response.json({ error: "Prospect id is required." }, { status: 400 });
    const db = coreDb();
    const prospect = await db.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospectId).first<Record<string, unknown>>();
    if (!prospect) return Response.json({ error: "Prospect not found." }, { status: 404 });
    const existing = await db.prepare("SELECT id FROM crm_accounts WHERE source_prospect_id = ? LIMIT 1").bind(prospectId).first<{ id: string }>();
    if (existing) return Response.json({ accountId: existing.id, duplicate: true });
    const now = new Date().toISOString();
    const accountId = crypto.randomUUID();
    const opportunityId = crypto.randomUUID();
    const assignedRep = String(prospect.assigned_rep || requestUser(request));
    await db.batch([
      db.prepare(`INSERT INTO crm_accounts
        (id, name, domain, phone, address, category, owner_email, source, source_prospect_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PROSPECTING', ?, ?, ?)`)
        .bind(accountId, prospect.business_name, prospect.domain, prospect.phone, prospect.address, prospect.category, assignedRep, prospectId, now, now),
      db.prepare(`INSERT INTO crm_opportunities
        (id, account_id, name, stage, value_cents, probability, assigned_rep, source, notes, created_at, updated_at)
        VALUES (?, ?, ?, 'NEW LEAD', 0, ?, ?, 'PROSPECTING', ?, ?, ?)`)
        .bind(opportunityId, accountId, `${prospect.business_name} · Cyncro opportunity`, Math.max(10, Number(prospect.opportunity_score || 0)), assignedRep, prospect.next_action, now, now),
      db.prepare("UPDATE prospects SET status = 'ASSIGNED', updated_at = ? WHERE id = ?").bind(now, prospectId),
    ]);
    return Response.json({ accountId, opportunityId, duplicate: false }, { status: 201 });
  } catch (error) {
    console.error("crm.convert_prospect.failed", error);
    return Response.json({ error: "Unable to convert this prospect to CRM." }, { status: 500 });
  }
}
