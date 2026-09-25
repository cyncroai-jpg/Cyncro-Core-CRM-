/** Setup checklist for a company, computed from real rows (nothing is ticked by hand). */
import { coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/tenantAuth";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const db = coreDb(); const t = tenant.tenantId;
    const n = async (sql: string, ...binds: unknown[]) => Number((await db.prepare(sql).bind(...binds).first<{ c: number }>())?.c || 0);
    const [members, google, eventTypes, availability, pipelines, contacts, workflows, forms, pages, settingsRow] = await Promise.all([
      n("SELECT COUNT(*) AS c FROM tenant_members WHERE tenant_id=? AND active=1", t),
      n("SELECT COUNT(*) AS c FROM calendar_oauth_connections coc JOIN tenant_members tm ON lower(tm.email)=lower(coc.owner) WHERE tm.tenant_id=? AND coc.provider='google'", t),
      n("SELECT COUNT(*) AS c FROM calendar_event_types WHERE tenant_id=? AND active=1", t),
      n("SELECT COUNT(*) AS c FROM calendar_availability WHERE tenant_id=? AND active=1", t),
      n("SELECT COUNT(*) AS c FROM crm_pipelines WHERE tenant_id=? AND active=1", t),
      n("SELECT COUNT(*) AS c FROM crm_contacts WHERE tenant_id=?", t),
      n("SELECT COUNT(*) AS c FROM automation_workflows WHERE tenant_id=? AND active=1", t),
      n("SELECT COUNT(*) AS c FROM crm_forms WHERE tenant_id=? AND status='PUBLISHED'", t),
      n("SELECT COUNT(*) AS c FROM studio_pages WHERE tenant_id=? AND status='PUBLISHED'", t),
      db.prepare("SELECT settings_json, created_at FROM tenants WHERE id=?").bind(t).first<{ settings_json: string | null; created_at: string }>(),
    ]);
    const steps = [
      { key: "company", label: "Set your company profile", hint: "Timezone, business hours, phone and logo drive booking pages, reminders and automations.", done: Boolean(settingsRow?.settings_json), view: "Team Access" },
      { key: "team", label: "Invite your team", hint: "Each teammate signs in with their own email and role.", done: members > 1, view: "Team Access" },
      { key: "google", label: "Connect Google Calendar and Gmail", hint: "Two-way calendar sync and sending email from your own address.", done: google > 0, view: "Team Access" },
      { key: "event", label: "Create an appointment type", hint: "What customers book: a consult, an estimate, a call.", done: eventTypes > 0, view: "Calendar" },
      { key: "hours", label: "Set your availability", hint: "Without hours, your booking page shows no open times.", done: availability > 0, view: "Calendar" },
      { key: "pipeline", label: "Set up your pipeline", hint: "The stages a deal moves through.", done: pipelines > 0, view: "Pipeline" },
      { key: "contacts", label: "Add or import contacts", hint: "Paste a CSV or add your first lead.", done: contacts > 0, view: "Contacts" },
      { key: "capture", label: "Publish a form or landing page", hint: "So leads land in the CRM by themselves.", done: forms + pages > 0, view: "Forms" },
      { key: "automation", label: "Switch on an automation", hint: "Start with a recipe: lead nurture, no-show recovery, review requests.", done: workflows > 0, view: "Automations" },
    ];
    const done = steps.filter((s) => s.done).length;
    return Response.json({ steps, done, total: steps.length, complete: done === steps.length, createdAt: settingsRow?.created_at });
  } catch (error) {
    console.error("crm.onboarding_failed", error);
    return Response.json({ error: "Unable to load setup progress." }, { status: 500 });
  }
}
