import { cleanText, coreDb, ensureCoreSchema, requestUser } from "@/lib/core/db";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const q = cleanText(new URL(request.url).searchParams.get("q"), 100);
    const db = coreDb();
    const statement = q
      ? db.prepare(`SELECT a.*, COUNT(DISTINCT c.id) AS contact_count, COUNT(DISTINCT o.id) AS opportunity_count,
          COALESCE(SUM(o.value_cents),0) AS pipeline_cents, COALESCE(SUM(o.collected_cents),0) AS collected_cents,
          COALESCE(SUM(CAST(o.collected_cents * o.commission_rate_bps AS INTEGER) / 10000),0) AS estimated_payout_cents,
          COALESCE(SUM(CAST(o.collected_cents * o.residual_rate_bps AS INTEGER) / 10000),0) AS monthly_residual_cents FROM crm_accounts a
          LEFT JOIN crm_contacts c ON c.account_id = a.id LEFT JOIN crm_opportunities o ON o.account_id = a.id
          WHERE a.name LIKE ? OR a.domain LIKE ? OR a.phone LIKE ? GROUP BY a.id ORDER BY a.updated_at DESC LIMIT 250`)
          .bind(...Array(3).fill(`%${q}%`))
      : db.prepare(`SELECT a.*, COUNT(DISTINCT c.id) AS contact_count, COUNT(DISTINCT o.id) AS opportunity_count,
          COALESCE(SUM(o.value_cents),0) AS pipeline_cents, COALESCE(SUM(o.collected_cents),0) AS collected_cents,
          COALESCE(SUM(CAST(o.collected_cents * o.commission_rate_bps AS INTEGER) / 10000),0) AS estimated_payout_cents,
          COALESCE(SUM(CAST(o.collected_cents * o.residual_rate_bps AS INTEGER) / 10000),0) AS monthly_residual_cents FROM crm_accounts a
          LEFT JOIN crm_contacts c ON c.account_id = a.id LEFT JOIN crm_opportunities o ON o.account_id = a.id
          GROUP BY a.id ORDER BY a.updated_at DESC LIMIT 250`);
    return Response.json({ accounts: (await statement.all()).results });
  } catch (error) {
    console.error("crm.accounts.list_failed", error);
    return Response.json({ error: "Unable to load CRM accounts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 160);
    if (!name) return Response.json({ error: "Account name is required." }, { status: 400 });
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    await coreDb().prepare(`INSERT INTO crm_accounts
      (id, name, domain, phone, address, category, owner_email, account_manager, sales_director, vp_sales, notes, source, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`)
      .bind(id, name, cleanText(body.domain, 240) || null, cleanText(body.phone, 40) || null,
        cleanText(body.address, 300) || null, cleanText(body.category, 100) || null,
        cleanText(body.ownerEmail, 254) || requestUser(request), cleanText(body.accountManager, 160) || null,
        cleanText(body.salesDirector, 160) || null, cleanText(body.vpSales, 160) || null, cleanText(body.notes, 5000) || null, cleanText(body.source, 80) || "MANUAL", now, now).run();
    return Response.json({ account: await coreDb().prepare("SELECT * FROM crm_accounts WHERE id = ?").bind(id).first() }, { status: 201 });
  } catch (error) {
    console.error("crm.accounts.create_failed", error);
    return Response.json({ error: "Unable to create CRM account." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema(); const body = await request.json() as Record<string, unknown>; const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Account id is required." }, { status: 400 });
    const updates = body.updates && typeof body.updates === "object" ? body.updates as Record<string, unknown> : {};
    const allowed: Record<string, [string, number]> = { name: ["name",160], domain:["domain",240], phone:["phone",40], address:["address",300], category:["category",100], accountManager:["account_manager",160], salesDirector:["sales_director",160], vpSales:["vp_sales",160], notes:["notes",5000], status:["status",30] };
    const fields: string[] = []; const values: unknown[] = [];
    for (const [key, [column, max]] of Object.entries(allowed)) if (updates[key] !== undefined) { fields.push(`${column}=?`); values.push(cleanText(updates[key], max) || null); }
    if (!fields.length) return Response.json({ error: "No account changes supplied." }, { status: 400 });
    fields.push("updated_at=?"); values.push(new Date().toISOString(), id);
    await coreDb().prepare(`UPDATE crm_accounts SET ${fields.join(",")} WHERE id=?`).bind(...values).run();
    return Response.json({ saved: true });
  } catch (error) { console.error("crm.accounts.update_failed", error); return Response.json({ error: "Unable to update account." }, { status: 500 }); }
}
