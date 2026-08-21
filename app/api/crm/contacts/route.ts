import { cleanText, coreDb, ensureCoreSchema, normalizeEmail, requestUser } from "@/lib/core/db";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const url = new URL(request.url);
    const query = cleanText(url.searchParams.get("q"), 100);
    const db = coreDb();
    const statement = query
      ? db.prepare(`SELECT c.*, a.name AS company_name FROM crm_contacts c LEFT JOIN crm_accounts a ON a.id = c.account_id
          WHERE c.full_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR a.name LIKE ? ORDER BY c.updated_at DESC LIMIT 250`)
          .bind(...Array(4).fill(`%${query}%`))
      : db.prepare(`SELECT c.*, a.name AS company_name FROM crm_contacts c LEFT JOIN crm_accounts a ON a.id = c.account_id
          ORDER BY c.updated_at DESC LIMIT 250`);
    const { results } = await statement.all();
    return Response.json({ contacts: results });
  } catch (error) {
    console.error("crm.contacts.list_failed", error);
    return Response.json({ error: "Unable to load CRM contacts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const fullName = cleanText(body.fullName, 160);
    const email = normalizeEmail(body.email);
    const phone = cleanText(body.phone, 40) || null;
    if (!fullName) return Response.json({ error: "Full name is required." }, { status: 400 });
    if (body.email && !email) return Response.json({ error: "Enter a valid email." }, { status: 400 });
    const db = coreDb();
    if (email) {
      const duplicate = await db.prepare("SELECT id FROM crm_contacts WHERE lower(email) = ? LIMIT 1").bind(email).first();
      if (duplicate) return Response.json({ error: "A CRM contact already uses this email.", duplicateId: duplicate.id }, { status: 409 });
    }
    const now = new Date().toISOString();
    const accountId = cleanText(body.accountId, 80) || null;
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO crm_contacts
      (id, account_id, full_name, email, phone, title, lifecycle, assigned_rep, source, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, accountId, fullName, email, phone, cleanText(body.title, 120) || null,
        cleanText(body.lifecycle, 40) || "LEAD", cleanText(body.assignedRep, 160) || requestUser(request),
        cleanText(body.source, 80) || "MANUAL", cleanText(body.notes, 5000) || null, now, now).run();
    const contact = await db.prepare("SELECT * FROM crm_contacts WHERE id = ?").bind(id).first();
    return Response.json({ contact }, { status: 201 });
  } catch (error) {
    console.error("crm.contacts.create_failed", error);
    return Response.json({ error: "Unable to create CRM contact." }, { status: 500 });
  }
}
