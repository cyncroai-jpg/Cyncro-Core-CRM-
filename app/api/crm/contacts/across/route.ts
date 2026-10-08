/** GET ?id=contact → that person's jobs, vehicle deals, dispute rounds, bookings, invoices and contracts across every product. */
import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/tenantAuth";
import { customerTimeline } from "@/lib/customers/unify";
import { companySettings } from "@/lib/core/companySettings";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireTenant(request); if (t instanceof Response) return t;
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    const c = await coreDb().prepare("SELECT id FROM crm_contacts WHERE id=? AND tenant_id=?").bind(id, t.tenantId).first();
    if (!c) return Response.json({ error: "Contact not found." }, { status: 404 });
    return Response.json({ ...(await customerTimeline(t.tenantId, id)), apps: (await companySettings(t.tenantId)).apps });
  } catch (error) { console.error("contacts.across_failed", error); return Response.json({ error: "Unable to load this customer's history." }, { status: 500 }); }
}
