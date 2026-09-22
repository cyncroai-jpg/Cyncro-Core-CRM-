import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant, requireTenantAction } from "@/lib/core/tenantAuth";
import { emailTransportStatus, sendEmail } from "@/lib/core/email";

const KINDS = new Set(["EMAIL", "SMS", "CALL", "NOTE", "MEETING"]);

/** GET: one thread per contact that has any communication, newest first, plus which channels are really connected. */
export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const db = coreDb();
    const { results } = await db.prepare(`
      SELECT c.id AS contact_id, c.full_name, c.email, c.phone, c.assigned_rep, c.lifecycle, a.name AS company_name,
        (SELECT COUNT(*) FROM crm_activities x WHERE x.contact_id=c.id AND x.activity_type IN ('EMAIL','SMS','CALL','NOTE','MEETING')) AS message_count,
        (SELECT x.activity_type FROM crm_activities x WHERE x.contact_id=c.id ORDER BY x.created_at DESC LIMIT 1) AS last_type,
        (SELECT x.title FROM crm_activities x WHERE x.contact_id=c.id ORDER BY x.created_at DESC LIMIT 1) AS last_title,
        (SELECT x.created_at FROM crm_activities x WHERE x.contact_id=c.id ORDER BY x.created_at DESC LIMIT 1) AS last_at,
        (SELECT COUNT(*) FROM calendar_bookings b WHERE b.contact_id=c.id AND b.status IN ('CONFIRMED','RESCHEDULED') AND b.starts_at >= ?) AS upcoming_bookings
      FROM crm_contacts c LEFT JOIN crm_accounts a ON a.id=c.account_id
      WHERE c.tenant_id=?
      ORDER BY COALESCE(last_at, c.updated_at) DESC LIMIT 300`).bind(new Date().toISOString(), tenant.tenantId).all();
    const email = await emailTransportStatus(tenant.tenantId);
    return Response.json({
      threads: results,
      channels: { email: { connected: email.transport !== "none", transport: email.transport, from: email.from }, sms: { connected: false }, social: { connected: false } },
      me: tenant.email,
    });
  } catch (error) {
    console.error("crm.conversations.list_failed", error);
    return Response.json({ error: "Unable to load conversations." }, { status: 500 });
  }
}

/** POST { contactId, kind: EMAIL|SMS|CALL|NOTE|MEETING, subject?, body }. EMAIL really sends; the rest log the touch. */
export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "create");
    if (tenant instanceof Response) return tenant;
    const body = (await request.json()) as Record<string, unknown>;
    const contactId = cleanText(body.contactId, 80);
    const kind = cleanText(body.kind, 20).toUpperCase();
    const text = cleanText(body.body, 8000);
    const subject = cleanText(body.subject, 200);
    if (!contactId || !KINDS.has(kind) || !text) return Response.json({ error: "Contact, kind and message are required." }, { status: 400 });
    const db = coreDb();
    const contact = await db.prepare("SELECT id, full_name, email FROM crm_contacts WHERE id=? AND tenant_id=?").bind(contactId, tenant.tenantId).first<{ id: string; full_name: string; email: string | null }>();
    if (!contact) return Response.json({ error: "Contact not found." }, { status: 404 });

    let sent = false;
    if (kind === "EMAIL") {
      if (!contact.email) return Response.json({ error: "This contact has no email address." }, { status: 400 });
      const status = await emailTransportStatus(tenant.tenantId);
      if (status.transport === "none") return Response.json({ error: "No email sender is connected. Add a Resend key or connect Google in Calendar, then try again." }, { status: 409 });
      const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">${text.split("\n").map((l) => `<p style="margin:0 0 12px">${l.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] || c)}</p>`).join("")}</div>`;
      sent = await sendEmail({ to: contact.email, subject: subject || `Message from ${tenant.email}`, html, replyTo: tenant.email, tenantId: tenant.tenantId });
      if (!sent) return Response.json({ error: "The email could not be sent. Check the connected sender." }, { status: 502 });
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = kind === "EMAIL" ? (subject || "Email sent") : kind === "CALL" ? "Call logged" : kind === "SMS" ? "Text logged" : kind === "MEETING" ? "Meeting logged" : text.slice(0, 80);
    await db.prepare(`INSERT INTO crm_activities (id,contact_id,activity_type,title,details,status,created_by,tenant_id,created_at,updated_at) VALUES (?,?,?,?,?,'COMPLETED',?,?,?,?)`)
      .bind(id, contactId, kind, title, text, tenant.email, tenant.tenantId, now, now).run();
    await db.prepare("UPDATE crm_contacts SET updated_at=? WHERE id=?").bind(now, contactId).run();
    return Response.json({ id, sent, kind }, { status: 201 });
  } catch (error) {
    console.error("crm.conversations.create_failed", error);
    return Response.json({ error: "Unable to save the message." }, { status: 500 });
  }
}
