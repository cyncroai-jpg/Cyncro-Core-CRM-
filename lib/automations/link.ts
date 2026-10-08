/** Products keep their own customer tables; automations need a CRM contact to email, text and tag. Find or create one by email (or phone). */
import { coreDb } from "@/lib/core/db";

export async function linkContact(tenantId: string, c: { name: string; email?: string | null; phone?: string | null; source: string }): Promise<string> {
  const db = coreDb(); const email = String(c.email || "").trim().toLowerCase(); const phone = String(c.phone || "").replace(/\D/g, "");
  if (!email && !phone) return "";
  const existing = email
    ? await db.prepare("SELECT id FROM crm_contacts WHERE tenant_id=? AND lower(email)=?").bind(tenantId, email).first<{ id: string }>()
    : await db.prepare("SELECT id FROM crm_contacts WHERE tenant_id=? AND replace(replace(replace(replace(COALESCE(phone,''),'-',''),' ',''),'(',''),')','') LIKE ?").bind(tenantId, `%${phone.slice(-10)}`).first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await db.prepare("INSERT INTO crm_contacts (id,full_name,email,phone,lifecycle,source,tenant_id,created_at,updated_at) VALUES (?,?,?,?,'CUSTOMER',?,?,?,?)").bind(id, c.name.trim().slice(0, 160) || email || phone, email || null, c.phone || null, c.source, tenantId, now, now).run();
  return id;
}
