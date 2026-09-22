import { cleanText, coreDb, ensureCoreSchema, normalizeEmail, normalizePhone } from "@/lib/core/db";
import { requireTenantAction } from "@/lib/core/tenantAuth";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "create");
    if (tenant instanceof Response) return tenant;

    const body = await request.json() as { rows?: Record<string, unknown>[]; assignedRep?: string; source?: string };
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 1000) : [];
    if (!rows.length) return Response.json({ error: "No leads supplied." }, { status: 400 });

    const db = coreDb();
    const now = new Date().toISOString();
    const source = cleanText(body.source, 80) || "CSV_IMPORT";
    const assigned = cleanText(body.assignedRep, 160) || tenant.email;

    // Dedupe inside this company only.
    const existingEmails = new Set<string>();
    const existingPhones = new Set<string>();
    const [emailRows, phoneRows] = await Promise.all([
      db.prepare("SELECT lower(email) email FROM crm_contacts WHERE tenant_id=? AND email IS NOT NULL").bind(tenant.tenantId).all<{ email: string }>(),
      db.prepare("SELECT phone FROM crm_contacts WHERE tenant_id=? AND phone IS NOT NULL").bind(tenant.tenantId).all<{ phone: string }>(),
    ]);
    emailRows.results.forEach(r => existingEmails.add(r.email));
    phoneRows.results.forEach(r => { const d = normalizePhone(r.phone); if (d) existingPhones.add(d); });

    let imported = 0, duplicates = 0, invalid = 0;
    const statements: ReturnType<typeof db.prepare>[] = [];

    for (const row of rows) {
      const first = cleanText(row.firstName, 80);
      const last = cleanText(row.lastName, 80);
      const full = cleanText(row.fullName, 160) || `${first} ${last}`.trim();
      const email = normalizeEmail(row.email);
      const phone = cleanText(row.phone, 40) || null;
      const phoneDigits = normalizePhone(phone);
      const company = cleanText(row.company, 160) || `${full || "Imported"} Account`;

      if (!full) { invalid++; continue; }
      if (email && existingEmails.has(email)) { duplicates++; continue; }
      if (phoneDigits && existingPhones.has(phoneDigits)) { duplicates++; continue; }
      if (row.email && !email) { invalid++; continue; }

      if (email) existingEmails.add(email);
      if (phoneDigits) existingPhones.add(phoneDigits);

      const accountId = crypto.randomUUID();
      const contactId = crypto.randomUUID();

      statements.push(
        db.prepare(`INSERT INTO crm_accounts (id,name,domain,phone,address,owner_email,source,status,tenant_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'ACTIVE',?,?,?)`)
          .bind(accountId, company, cleanText(row.website, 240) || null, phone, cleanText(row.address, 300) || null, tenant.email, source, tenant.tenantId, now, now)
      );
      statements.push(
        db.prepare(`INSERT INTO crm_contacts (id,account_id,full_name,email,phone,title,lifecycle,assigned_rep,source,notes,tenant_id,created_at,updated_at) VALUES (?,?,?,?,?,?,'LEAD',?,?,?,?,?,?)`)
          .bind(contactId, accountId, full, email, phone, cleanText(row.title, 120) || null, assigned, source, cleanText(row.notes, 2000) || null, tenant.tenantId, now, now)
      );
      imported++;
    }

    // D1 batch limit is 100 statements; chunk to be safe.
    for (let i = 0; i < statements.length; i += 80) await db.batch(statements.slice(i, i + 80));

    return Response.json({ imported, duplicates, invalid, total: rows.length }, { status: 201 });
  } catch (error) {
    console.error("contacts.import_failed", error);
    return Response.json({ error: "Lead import failed." }, { status: 500 });
  }
}
