/**
 * Inbound email entry point shared by the worker's email() handler (Cloudflare
 * Email Routing) and, when E2E_INGEST_TOKEN is set on the deployment, a
 * token-gated POST so the suite can exercise the same path. Without that
 * secret the POST is a 404.
 */
import { env } from "cloudflare:workers";
import { ensureCoreSchema, coreDb } from "@/lib/core/db";
import { ingestInbound } from "@/lib/messages/inbox";

export type InboundEmail = { to: string; from: string; name?: string; subject?: string; text: string; messageId?: string };

/** Finds the company by the address mail was sent to: the inbox address they set, else <company-slug>@anything. */
export async function ingestEmail(mail: InboundEmail): Promise<{ ok: boolean; detail: string; threadId?: string }> {
  const to = mail.to.trim().toLowerCase().replace(/^.*<([^>]+)>.*$/, "$1"); const local = to.split("@")[0];
  const fromAddr = mail.from.trim().toLowerCase().replace(/^.*<([^>]+)>.*$/, "$1");
  const fromName = mail.name || mail.from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || fromAddr;
  if (!to || !fromAddr) return { ok: false, detail: "missing addresses" };
  const db = coreDb();
  let tenantId = (await db.prepare("SELECT tenant_id FROM msg_settings WHERE json_extract(settings_json,'$.inboundAddress')=?").bind(to).first<{ tenant_id: string }>())?.tenant_id;
  if (!tenantId) tenantId = (await db.prepare("SELECT id FROM tenants WHERE slug=? AND active=1").bind(local.replace(/\+.*$/, "")).first<{ id: string }>())?.id;
  if (!tenantId) return { ok: false, detail: `no company receives mail at ${to}` };
  const text = mail.text.replace(/\r\n/g, "\n").split(/\n(?:On .+wrote:|-{2,}\s*Original Message|From: )/)[0].trim();
  const r = await ingestInbound({ tenantId, kind: "EMAIL", externalUserId: fromAddr, name: fromName, email: fromAddr, body: text || "(empty message)", subject: (mail.subject || "").slice(0, 200) || null, messageKind: "EMAIL", externalMessageId: mail.messageId || null });
  return { ok: true, detail: r.duplicate ? "duplicate" : "received", threadId: r.threadId };
}

export async function POST(request: Request) {
  const token = String((env as unknown as Record<string, string | undefined>).E2E_INGEST_TOKEN || "");
  if (!token || request.headers.get("x-ingest-token") !== token) return new Response("Not found", { status: 404 });
  await ensureCoreSchema();
  const body = (await request.json().catch(() => ({}))) as Partial<InboundEmail>;
  const r = await ingestEmail({ to: String(body.to || ""), from: String(body.from || ""), name: body.name, subject: body.subject, text: String(body.text || ""), messageId: body.messageId });
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
