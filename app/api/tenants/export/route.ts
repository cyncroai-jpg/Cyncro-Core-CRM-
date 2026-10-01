/** Company data export (OWNER only): every core table for this company as one JSON file. */
import { coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/tenantAuth";

const TABLES: [string, string][] = [
  ["company", "SELECT id, name, slug, plan, seats, settings_json, created_at FROM tenants WHERE id=?"],
  ["team", "SELECT email, display_name, role, active, created_at FROM tenant_members WHERE tenant_id=?"],
  ["accounts", "SELECT * FROM crm_accounts WHERE tenant_id=?"],
  ["contacts", "SELECT * FROM crm_contacts WHERE tenant_id=?"],
  ["activities", "SELECT * FROM crm_activities WHERE tenant_id=?"],
  ["deals", "SELECT * FROM crm_opportunities WHERE tenant_id=?"],
  ["pipelines", "SELECT * FROM crm_pipelines WHERE tenant_id=?"],
  ["tasks", "SELECT * FROM work_tasks WHERE tenant_id=?"],
  ["event_types", "SELECT * FROM calendar_event_types WHERE tenant_id=?"],
  ["bookings", "SELECT * FROM calendar_bookings WHERE tenant_id=?"],
  ["forms", "SELECT * FROM crm_forms WHERE tenant_id=?"],
  ["form_submissions", "SELECT s.* FROM crm_form_submissions s JOIN crm_forms f ON f.id=s.form_id WHERE f.tenant_id=?"],
  ["landing_pages", "SELECT * FROM studio_pages WHERE tenant_id=?"],
  ["landing_page_leads", "SELECT * FROM studio_submissions WHERE tenant_id=?"],
  ["invoices", "SELECT * FROM crm_invoices WHERE tenant_id=?"],
  ["contracts", "SELECT id, title, client_name, client_email, status, signer_name, signed_at, created_at FROM crm_contracts WHERE tenant_id=?"],
  ["workflows", "SELECT * FROM automation_workflows WHERE tenant_id=?"],
  ["workflow_runs", "SELECT * FROM automation_enrollments WHERE tenant_id=?"],
  ["dispatch_customers", "SELECT * FROM dispatch_customers WHERE tenant_id=?"],
  ["dispatch_jobs", "SELECT * FROM dispatch_jobs WHERE tenant_id=?"],
  ["dispatch_technicians", "SELECT * FROM dispatch_technicians WHERE tenant_id=?"],
  ["audit_log", "SELECT * FROM audit_logs WHERE tenant_id=? ORDER BY created_at DESC LIMIT 5000"],
];

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    if (tenant.role !== "OWNER") return Response.json({ error: "Only an owner can export company data." }, { status: 403 });
    const db = coreDb(); const out: Record<string, unknown> = { exported_at: new Date().toISOString(), exported_by: tenant.email };
    for (const [name, sql] of TABLES) {
      try { out[name] = (await db.prepare(sql).bind(tenant.tenantId).all()).results; } catch { out[name] = []; }
    }
    await db.prepare("INSERT INTO audit_logs (id, tenant_id, user_id, email, action, resource_type, resource_id, details, created_at) VALUES (?,?,?,?,'EXPORT_DATA','tenant',?,?,?)").bind(crypto.randomUUID(), tenant.tenantId, tenant.userId, tenant.email, tenant.tenantId, JSON.stringify({ tables: TABLES.length }), new Date().toISOString()).run().catch(() => undefined);
    return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="cyncro-export-${new Date().toISOString().slice(0, 10)}.json"` } });
  } catch (error) { console.error("tenant.export_failed", error); return Response.json({ error: "Export failed." }, { status: 500 }); }
}
