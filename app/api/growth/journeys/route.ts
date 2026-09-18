import { coreDb, cleanText, hasModuleAccess } from "@/lib/core/db";
import { ensureGrowthSchema } from "@/lib/growth/db";

/** Real visual customer-journey timeline for one contact — every tracked touch, in order, with revenue where it occurred. */
export async function GET(request: Request) {
  try {
    await ensureGrowthSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "Access required." }, { status: 403 });
    const url = new URL(request.url);
    const contactId = cleanText(url.searchParams.get("contactId"), 80);
    const visitorId = cleanText(url.searchParams.get("visitorId"), 80);
    if (!contactId && !visitorId) return Response.json({ error: "contactId or visitorId is required." }, { status: 400 });
    const db = coreDb();

    const events = contactId
      ? await db.prepare("SELECT * FROM gi_events WHERE contact_id=? ORDER BY created_at ASC").bind(contactId).all()
      : await db.prepare("SELECT * FROM gi_events WHERE visitor_id=? ORDER BY created_at ASC").bind(visitorId).all();

    let contact: Record<string, unknown> | null = null;
    if (contactId) contact = await db.prepare("SELECT * FROM crm_contacts WHERE id=?").bind(contactId).first();
    else {
      const visitor = await db.prepare("SELECT contact_id FROM gi_visitors WHERE id=?").bind(visitorId).first<{ contact_id: string | null }>();
      if (visitor?.contact_id) contact = await db.prepare("SELECT * FROM crm_contacts WHERE id=?").bind(visitor.contact_id).first();
    }

    const opportunities = contact
      ? (await db.prepare("SELECT id, name, stage, value_cents, updated_at FROM crm_opportunities WHERE primary_contact_id=?").bind(contact.id).all()).results
      : [];

    return Response.json({ contact, events: events.results || [], opportunities });
  } catch (error) {
    console.error("growth.journeys.load_failed", error);
    return Response.json({ error: "Unable to load journey." }, { status: 500 });
  }
}
