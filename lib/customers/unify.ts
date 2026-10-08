/**
 * One customer record. Dispatch, Automotive and Dispute keep their own
 * customer tables (they carry product-specific fields), but every row points
 * at the CRM contact for the same person, matched by email, then phone.
 * New rows are linked as they are created; older rows are linked by the cron
 * a batch at a time, so nothing is ever lost or duplicated.
 */
import { coreDb } from "@/lib/core/db";
import { linkContact } from "@/lib/automations/link";

export async function linkDispatchCustomer(tenantId: string, id: string): Promise<string> {
  const db = coreDb(); const c = await db.prepare("SELECT name, email, phone, contact_id FROM dispatch_customers WHERE id=? AND tenant_id=?").bind(id, tenantId).first<{ name: string; email: string | null; phone: string | null; contact_id: string | null }>();
  if (!c) return ""; if (c.contact_id) return c.contact_id;
  const contactId = await linkContact(tenantId, { name: c.name, email: c.email, phone: c.phone, source: "DISPATCH" });
  if (contactId) await db.prepare("UPDATE dispatch_customers SET contact_id=? WHERE id=?").bind(contactId, id).run();
  return contactId;
}
export async function linkAutoCustomer(tenantId: string, id: string): Promise<string> {
  const db = coreDb(); const c = await db.prepare("SELECT first_name, last_name, email, phone, contact_id FROM auto_customers WHERE id=? AND tenant_id=?").bind(id, tenantId).first<{ first_name: string; last_name: string; email: string | null; phone: string | null; contact_id: string | null }>();
  if (!c) return ""; if (c.contact_id) return c.contact_id;
  const contactId = await linkContact(tenantId, { name: `${c.first_name} ${c.last_name}`.trim(), email: c.email, phone: c.phone, source: "DEALERSHIP" });
  if (contactId) await db.prepare("UPDATE auto_customers SET contact_id=? WHERE id=?").bind(contactId, id).run();
  return contactId;
}
export async function linkCreditClient(tenantId: string, id: string): Promise<string> {
  const db = coreDb(); const c = await db.prepare("SELECT first_name, last_name, email, phone_number, contact_id FROM credit_repair_clients WHERE id=? AND tenant_id=?").bind(id, tenantId).first<{ first_name: string; last_name: string; email: string; phone_number: string | null; contact_id: string | null }>();
  if (!c) return ""; if (c.contact_id) return c.contact_id;
  const contactId = await linkContact(tenantId, { name: `${c.first_name} ${c.last_name}`.trim(), email: c.email, phone: c.phone_number, source: "DISPUTE" });
  if (contactId) await db.prepare("UPDATE credit_repair_clients SET contact_id=? WHERE id=?").bind(contactId, id).run();
  return contactId;
}

/** Cron: link rows created before this existed, a batch at a time. */
export async function linkUnlinkedCustomers(limit = 150): Promise<{ dispatch: number; automotive: number; dispute: number }> {
  const db = coreDb(); const out = { dispatch: 0, automotive: 0, dispute: 0 };
  for (const r of (await db.prepare("SELECT id, tenant_id FROM dispatch_customers WHERE contact_id IS NULL AND tenant_id IS NOT NULL AND (email IS NOT NULL OR phone IS NOT NULL) LIMIT ?").bind(limit).all<{ id: string; tenant_id: string }>()).results) if (await linkDispatchCustomer(r.tenant_id, r.id)) out.dispatch++;
  for (const r of (await db.prepare("SELECT id, tenant_id FROM auto_customers WHERE contact_id IS NULL AND (email IS NOT NULL OR phone IS NOT NULL) LIMIT ?").bind(limit).all<{ id: string; tenant_id: string }>()).results) if (await linkAutoCustomer(r.tenant_id, r.id)) out.automotive++;
  for (const r of (await db.prepare("SELECT id, tenant_id FROM credit_repair_clients WHERE contact_id IS NULL LIMIT ?").bind(limit).all<{ id: string; tenant_id: string }>()).results) if (await linkCreditClient(r.tenant_id, r.id)) out.dispute++;
  return out;
}

/** Everything this person has across every product, for the contact page. */
export async function customerTimeline(tenantId: string, contactId: string) {
  const db = coreDb();
  const [jobs, vehicleDeals, disputeRounds, bookings, invoices, contracts] = await Promise.all([
    db.prepare("SELECT j.id, j.service_type, j.status, j.scheduled_at, j.address, j.revenue_cents, t.name AS tech FROM dispatch_jobs j JOIN dispatch_customers c ON c.id=j.customer_id LEFT JOIN dispatch_technicians t ON t.id=j.assigned_tech_id WHERE j.tenant_id=? AND c.contact_id=? ORDER BY COALESCE(j.scheduled_at, j.created_at) DESC LIMIT 25").bind(tenantId, contactId).all<Record<string, unknown>>(),
    db.prepare("SELECT d.id, d.status, d.contract_status, d.sale_price_cents, d.monthly_payment_cents, d.created_at, i.year, i.make, i.model FROM auto_deals d JOIN auto_customers c ON c.id=d.customer_id LEFT JOIN auto_inventory i ON i.id=d.vehicle_id WHERE d.tenant_id=? AND c.contact_id=? ORDER BY d.created_at DESC LIMIT 25").bind(tenantId, contactId).all<Record<string, unknown>>(),
    db.prepare("SELECT r.id, r.round_number, r.credit_bureau, r.status, r.opened_at, r.closed_at FROM dispute_rounds r JOIN credit_repair_clients c ON c.id=r.client_id WHERE r.tenant_id=? AND c.contact_id=? ORDER BY r.opened_at DESC LIMIT 25").bind(tenantId, contactId).all<Record<string, unknown>>(),
    db.prepare("SELECT b.id, b.starts_at, b.status, b.location_mode, e.name AS event_name FROM calendar_bookings b LEFT JOIN calendar_event_types e ON e.id=b.event_type_id WHERE b.tenant_id=? AND b.contact_id=? ORDER BY b.starts_at DESC LIMIT 25").bind(tenantId, contactId).all<Record<string, unknown>>(),
    db.prepare("SELECT i.id, i.invoice_number, i.amount_cents, i.status, i.due_date, i.paid_at FROM crm_invoices i JOIN crm_contacts c ON lower(c.email)=lower(i.client_email) WHERE i.tenant_id=? AND c.id=? ORDER BY i.created_at DESC LIMIT 25").bind(tenantId, contactId).all<Record<string, unknown>>(),
    db.prepare("SELECT k.id, k.title, k.status, k.signed_at, k.created_at FROM crm_contracts k JOIN crm_contacts c ON lower(c.email)=lower(k.client_email) WHERE k.tenant_id=? AND c.id=? ORDER BY k.created_at DESC LIMIT 25").bind(tenantId, contactId).all<Record<string, unknown>>(),
  ]);
  return { jobs: jobs.results, vehicleDeals: vehicleDeals.results, disputeRounds: disputeRounds.results, bookings: bookings.results, invoices: invoices.results, contracts: contracts.results };
}
