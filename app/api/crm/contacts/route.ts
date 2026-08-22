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
    let accountId = cleanText(body.accountId, 80) || null;
    const company = cleanText(body.company, 160);
    if (!accountId && company) {
      const existingAccount = await db.prepare("SELECT id FROM crm_accounts WHERE lower(name) = lower(?) LIMIT 1").bind(company).first<{ id: string }>();
      accountId = existingAccount?.id || crypto.randomUUID();
      if (!existingAccount) await db.prepare(`INSERT INTO crm_accounts
        (id, name, owner_email, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`)
        .bind(accountId, company, requestUser(request), cleanText(body.source, 80) || "MANUAL", now, now).run();
    }
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

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    if (!id) return Response.json({ error: "Contact id is required." }, { status: 400 });
    const updates = body.updates && typeof body.updates === "object" ? body.updates as Record<string, unknown> : {};
    const fields: string[] = []; const values: unknown[] = [];
    const add = (column: string, value: unknown) => { fields.push(`${column} = ?`); values.push(value); };
    if (updates.fullName !== undefined) { const value = cleanText(updates.fullName, 160); if (!value) return Response.json({ error: "Full name is required." }, { status: 400 }); add("full_name", value); }
    if (updates.email !== undefined) { const value = normalizeEmail(updates.email); if (updates.email && !value) return Response.json({ error: "Enter a valid email." }, { status: 400 }); add("email", value); }
    if (updates.phone !== undefined) add("phone", cleanText(updates.phone, 40) || null);
    if (updates.title !== undefined) add("title", cleanText(updates.title, 120) || null);
    if (updates.lifecycle !== undefined) add("lifecycle", cleanText(updates.lifecycle, 40).toUpperCase());
    if (updates.assignedRep !== undefined) add("assigned_rep", cleanText(updates.assignedRep, 160) || null);
    if (updates.notes !== undefined) add("notes", cleanText(updates.notes, 5000) || null);
    if (!fields.length) return Response.json({ error: "No valid contact changes supplied." }, { status: 400 });
    add("updated_at", new Date().toISOString()); values.push(id);
    await coreDb().prepare(`UPDATE crm_contacts SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    const contact = await coreDb().prepare(`SELECT c.*, a.name AS company_name FROM crm_contacts c LEFT JOIN crm_accounts a ON a.id = c.account_id WHERE c.id = ?`).bind(id).first();
    return contact ? Response.json({ contact }) : Response.json({ error: "Contact not found." }, { status: 404 });
  } catch (error) {
    console.error("crm.contacts.update_failed", error);
    return Response.json({ error: "Unable to update CRM contact." }, { status: 500 });
  }
}
