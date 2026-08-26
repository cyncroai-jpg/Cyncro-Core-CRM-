import { env } from "cloudflare:workers";
import { cleanText, coreDb, ensureCoreSchema, normalizeEmail } from "@/lib/core/db";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type,x-cyncro-secret", "Access-Control-Allow-Methods": "POST,OPTIONS" };
export async function OPTIONS() { return new Response(null, { status: 204, headers: cors }); }

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const configured = String((env as unknown as Record<string, unknown>).FRAMER_WEBHOOK_SECRET || "");
    if (!configured || request.headers.get("x-cyncro-secret") !== configured) return Response.json({ error: "Invalid webhook credentials." }, { status: 401, headers: cors });
    const body = await request.json() as Record<string, unknown>;
    const fullName = cleanText(body.fullName || body.name, 160);
    const email = normalizeEmail(body.email);
    const phone = cleanText(body.phone, 40) || null;
    if (!fullName || (!email && !phone)) return Response.json({ error: "Name and email or phone are required." }, { status: 400, headers: cors });
    const db = coreDb(); const now = new Date().toISOString();
    const duplicate = email ? await db.prepare("SELECT id FROM crm_contacts WHERE lower(email)=lower(?)").bind(email).first<{id:string}>() : null;
    if (duplicate) {
      await db.prepare("UPDATE crm_contacts SET full_name=?,phone=COALESCE(?,phone),source='FRAMER',updated_at=? WHERE id=?").bind(fullName,phone,now,duplicate.id).run();
      return Response.json({ saved: true, contactId: duplicate.id, duplicate: true }, { headers: cors });
    }
    const accountId = crypto.randomUUID(); const contactId = crypto.randomUUID();
    const company = cleanText(body.company,160) || `${fullName} Account`;
    await db.batch([
      db.prepare("INSERT INTO crm_accounts (id,name,source,status,created_at,updated_at) VALUES (?,?,'FRAMER','ACTIVE',?,?)").bind(accountId,company,now,now),
      db.prepare(`INSERT INTO crm_contacts (id,account_id,full_name,email,phone,lifecycle,assigned_rep,source,notes,created_at,updated_at) VALUES (?,?,?,?,?,'LEAD',NULL,'FRAMER',?,?,?)`).bind(contactId,accountId,fullName,email,phone,cleanText(body.notes || body.message,5000)||null,now,now),
    ]);
    return Response.json({ saved: true, contactId }, { status: 201, headers: cors });
  } catch (error) {
    console.error("integrations.framer_failed", error);
    return Response.json({ error: "Lead could not be accepted." }, { status: 500, headers: cors });
  }
}
