/**
 * Twilio inbound SMS webhook. Point your Twilio number's "A message comes in"
 * URL at POST /api/webhooks/twilio. Validated with the X-Twilio-Signature
 * header when TWILIO_AUTH_TOKEN is set. The text is logged on the matching
 * contact (by phone), WAIT_FOR steps waiting on a reply wake up, and every
 * "Customer texted in" workflow fires. Replies with empty TwiML so Twilio
 * doesn't auto-respond.
 */
import { env } from "cloudflare:workers";
import { coreDb, ensureCoreSchema, normalizePhone } from "@/lib/core/db";
import { emitAutomationEvent } from "@/lib/automations/engine";
import { companySettings, withinBusinessHours } from "@/lib/core/companySettings";
import { ask, approve, pendingFor } from "@/lib/ai/assistant";
import { sendSms } from "@/lib/automations/sms";
import { ensureUserDefaultTenant, type TenantContext } from "@/lib/core/db";

const twiml = () => new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { headers: { "Content-Type": "text/xml" } });

async function validSignature(request: Request, params: URLSearchParams): Promise<boolean> {
  const token = String((env as unknown as Record<string, string | undefined>).TWILIO_AUTH_TOKEN || "");
  if (!token) return true; // not configured: accept (the route only logs texts to matching contacts)
  const sig = request.headers.get("x-twilio-signature") || "";
  if (!sig) return false;
  const url = new URL(request.url); url.protocol = "https:";
  const base = url.origin + url.pathname + [...params.keys()].sort().map((k) => k + (params.get(k) || "")).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === sig;
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const params = new URLSearchParams(await request.text());
    if (!(await validSignature(request, params))) return new Response("invalid signature", { status: 403 });
    const from = normalizePhone(params.get("From") || "") || String(params.get("From") || "");
    const body = String(params.get("Body") || "").slice(0, 1600).trim();
    if (!from || !body) return twiml();
    const db = coreDb(); const now = new Date().toISOString();
    const digits = from.replace(/\D/g, "").slice(-10);
    // A teammate texting from their verified mobile is talking to Cyncro AI, not a customer texting in.
    const teammate = digits.length === 10 ? await db.prepare("SELECT id, email, display_name FROM auth_users WHERE active=1 AND phone IS NOT NULL AND substr(replace(replace(replace(replace(phone,'-',''),' ',''),'(',''),')',''), -10)=?").bind(digits).first<{ id: string; email: string; display_name: string }>() : null;
    if (teammate) {
      const tenantId = await ensureUserDefaultTenant(teammate.email);
      const m = await db.prepare("SELECT role FROM tenant_members WHERE tenant_id=? AND lower(email)=lower(?) AND active=1").bind(tenantId, teammate.email).first<{ role: string }>();
      const tenant: TenantContext = { tenantId, userId: teammate.id, email: teammate.email, role: (m?.role || "USER") as TenantContext["role"] };
      let text = "";
      try {
        if (/^(yes|y|ok|okay|confirm|approve|do it)\b/i.test(body)) {
          const list = await pendingFor(tenant);
          if (!list.length) text = "Nothing is waiting for your approval.";
          else { const r = await approve(tenant, list[list.length - 1].id); text = `Done: ${r.summary}`; }
        } else if (/^(no|cancel|skip|nevermind|never mind)\b/i.test(body)) {
          const list = await pendingFor(tenant);
          if (list.length) { await db.prepare("UPDATE ai_pending_actions SET status='DISMISSED', resolved_at=? WHERE id=?").bind(now, list[list.length - 1].id).run(); text = `Skipped: ${list[list.length - 1].summary}`; } else text = "Nothing to cancel.";
        } else {
          const r = await ask(tenant, body, "SMS", "sms");
          text = r.reply + (r.pending.length ? `\n\nReply YES to confirm: ${r.pending.map((p) => p.summary).join("; ")}` : "");
        }
      } catch (e) { text = e instanceof Error ? e.message : "Cyncro couldn't answer that right now."; }
      await sendSms(from, text.slice(0, 1500));
      return twiml();
    }
    const { results: contacts } = await db.prepare("SELECT id, tenant_id, full_name FROM crm_contacts WHERE tenant_id IS NOT NULL AND replace(replace(replace(replace(COALESCE(phone,''),'-',''),' ',''),'(',''),')','') LIKE ? LIMIT 5").bind(`%${digits}`).all<{ id: string; tenant_id: string; full_name: string }>();
    for (const c of contacts) {
      await db.prepare("INSERT INTO crm_activities (id,contact_id,activity_type,title,details,status,created_by,tenant_id,created_at,updated_at) VALUES (?,?,'SMS',?,?,'COMPLETED','inbound',?,?,?)").bind(crypto.randomUUID(), c.id, `Text from ${c.full_name}`, body, c.tenant_id, now, now).run();
      const open = withinBusinessHours(new Date(), await companySettings(c.tenant_id));
      await emitAutomationEvent(c.tenant_id, "INBOUND_SMS", { contactId: c.id, body, from, withinBusinessHours: open ? "true" : "false", trigger: "INBOUND_SMS" });
    }
    return twiml();
  } catch (error) {
    console.error("webhooks.twilio_failed", error);
    return twiml();
  }
}
