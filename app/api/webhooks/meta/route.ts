/**
 * Meta webhook for Messenger, Instagram and WhatsApp, plus the two callbacks
 * App Review requires:
 *   GET  /api/webhooks/meta                  → subscription verification (hub.challenge)
 *   POST /api/webhooks/meta                  → events (signed with X-Hub-Signature-256)
 *   POST /api/webhooks/meta?action=deauthorize → user removed the app: drop their channels
 *   POST /api/webhooks/meta?action=delete      → data deletion request: drop channels + threads, return a confirmation code
 */
import { coreDb, ensureCoreSchema } from "@/lib/core/db";
import { verifyMetaSignature, metaVerifyToken, parseSignedRequest, graphProfile } from "@/lib/messages/meta";
import { channelByExternal, ingestInbound, type Channel } from "@/lib/messages/inbox";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("hub.mode") === "subscribe" && metaVerifyToken() && url.searchParams.get("hub.verify_token") === metaVerifyToken()) {
    return new Response(url.searchParams.get("hub.challenge") || "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

type Messaging = { sender?: { id: string }; recipient?: { id: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: { type: string }[]; reply_to?: { story?: { id: string } } } };
type Change = { field?: string; value?: Record<string, unknown> };
type Entry = { id?: string; time?: number; messaging?: Messaging[]; changes?: Change[] };

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const url = new URL(request.url); const action = url.searchParams.get("action");
    if (action === "deauthorize" || action === "delete") return handleCallback(request, action);
    const raw = await request.text();
    if (!(await verifyMetaSignature(raw, request.headers.get("x-hub-signature-256")))) return new Response("bad signature", { status: 403 });
    const payload = JSON.parse(raw) as { object?: string; entry?: Entry[] };
    const object = String(payload.object || "");
    for (const entry of payload.entry || []) {
      if (object === "page" || object === "instagram") await handleSocialEntry(object === "page" ? "FACEBOOK" : "INSTAGRAM", entry);
      else if (object === "whatsapp_business_account") await handleWhatsAppEntry(entry);
    }
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("webhooks.meta_failed", error);
    return new Response("ok", { status: 200 }); // Meta retries on non-200; a bad event shouldn't block the queue
  }
}

async function handleSocialEntry(kind: "FACEBOOK" | "INSTAGRAM", entry: Entry) {
  const accountId = String(entry.id || ""); if (!accountId) return;
  const channel = await channelByExternal(kind, accountId); if (!channel) return;
  for (const m of entry.messaging || []) {
    if (!m.sender?.id || m.message?.is_echo || m.sender.id === accountId) continue;
    const text = String(m.message?.text || "").trim() || (m.message?.attachments?.length ? `[${m.message.attachments.map((a) => a.type).join(", ")} attachment]` : "");
    if (!text) continue;
    const who = await graphProfile(channel, m.sender.id).catch(() => ({ name: "", handle: "" }));
    await ingestInbound({ tenantId: channel.tenant_id, kind, channelId: channel.id, externalUserId: m.sender.id, name: who.name || who.handle || null, handle: who.handle || null, body: text, messageKind: m.message?.reply_to?.story ? "STORY_REPLY" : "MESSAGE", externalMessageId: m.message?.mid || null, at: m.timestamp ? new Date(m.timestamp).toISOString() : null });
  }
  for (const ch of entry.changes || []) {
    const v = ch.value || {};
    if (kind === "FACEBOOK" && ch.field === "feed" && v.item === "comment" && v.verb === "add") {
      const from = v.from as { id?: string; name?: string } | undefined; if (!from?.id || from.id === accountId) continue;
      await ingestInbound({ tenantId: channel.tenant_id, kind, channelId: channel.id, externalUserId: from.id, name: from.name || null, body: String(v.message || ""), messageKind: "COMMENT", externalMessageId: String(v.comment_id || ""), externalRef: String(v.comment_id || "") });
    }
    if (kind === "INSTAGRAM" && ch.field === "comments") {
      const from = v.from as { id?: string; username?: string } | undefined; if (!from?.id || from.id === accountId) continue;
      await ingestInbound({ tenantId: channel.tenant_id, kind, channelId: channel.id, externalUserId: from.id, name: from.username || null, handle: from.username || null, body: String(v.text || ""), messageKind: "COMMENT", externalMessageId: String(v.id || ""), externalRef: String(v.id || "") });
    }
  }
}

async function handleWhatsAppEntry(entry: Entry) {
  for (const ch of entry.changes || []) {
    if (ch.field !== "messages") continue;
    const v = ch.value as { metadata?: { phone_number_id?: string }; contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: { from: string; id: string; timestamp?: string; type?: string; text?: { body?: string } }[] };
    const numberId = String(v.metadata?.phone_number_id || ""); if (!numberId) continue;
    const channel: Channel | null = await channelByExternal("WHATSAPP", numberId); if (!channel) continue;
    for (const m of v.messages || []) {
      const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name || "";
      const text = m.type === "text" ? String(m.text?.body || "") : `[${m.type || "media"} message]`;
      await ingestInbound({ tenantId: channel.tenant_id, kind: "WHATSAPP", channelId: channel.id, externalUserId: m.from, name: name || null, phone: `+${m.from}`, body: text, messageKind: "MESSAGE", externalMessageId: m.id, at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null });
    }
  }
}

async function handleCallback(request: Request, action: "deauthorize" | "delete") {
  const form = new URLSearchParams(await request.text());
  const parsed = await parseSignedRequest(String(form.get("signed_request") || ""));
  if (!parsed?.user_id) return Response.json({ error: "bad signed_request" }, { status: 400 });
  const db = coreDb(); const t = new Date().toISOString();
  const { results } = await db.prepare("SELECT id FROM msg_channels WHERE meta_user_id=?").bind(parsed.user_id).all<{ id: string }>();
  await db.prepare("UPDATE msg_channels SET status='REMOVED', access_token=NULL, updated_at=? WHERE meta_user_id=?").bind(t, parsed.user_id).run();
  if (action === "delete") {
    for (const c of results) {
      await db.prepare("DELETE FROM msg_messages WHERE thread_id IN (SELECT id FROM msg_threads WHERE channel_id=?)").bind(c.id).run();
      await db.prepare("DELETE FROM msg_threads WHERE channel_id=?").bind(c.id).run();
    }
    await db.prepare("DELETE FROM msg_channels WHERE meta_user_id=?").bind(parsed.user_id).run();
    const code = crypto.randomUUID().slice(0, 12);
    return Response.json({ url: `${new URL(request.url).origin}/privacy?deletion=${code}`, confirmation_code: code });
  }
  return Response.json({ removed: results.length });
}
