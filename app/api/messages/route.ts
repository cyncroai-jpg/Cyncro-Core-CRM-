/**
 * Cyncro Messages API (company-scoped).
 *   GET  ?view=threads[&kind=&status=&q=]   inbox list + per-channel counts
 *   GET  ?view=thread&id=                  one conversation, marks it read
 *   GET  ?view=channels                    honest status of every channel + settings
 *   POST {action:"send", threadId, body[, replyToCommentId, privateReply]}
 *   POST {action:"approve", threadId[, body]}   send the AI draft (optionally edited)
 *   POST {action:"dismiss", threadId}
 *   POST {action:"start", contactId, kind:"EMAIL"|"SMS", body[, subject]}
 *   POST {action:"close"|"reopen"|"assign", threadId[, assignee]}
 *   POST {action:"settings", ...Settings}
 *   POST {action:"connect_whatsapp", phoneNumberId, token, displayName}
 *   POST {action:"disconnect", channelId}
 */
import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant, requireTenantAction } from "@/lib/core/tenantAuth";
import { channelStatuses, disconnectChannel, listThreads, saveSettings, sendOutbound, settingsFor, startThread, threadDetail, upsertChannel, INTENTS, CHANNEL_KINDS } from "@/lib/messages/inbox";
import { metaAppConfigured } from "@/lib/messages/meta";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireTenant(request); if (t instanceof Response) return t;
    const url = new URL(request.url); const view = url.searchParams.get("view") || "threads";
    if (view === "thread") {
      const d = await threadDetail(t.tenantId, cleanText(url.searchParams.get("id"), 80));
      if (!d) return Response.json({ error: "Conversation not found." }, { status: 404 });
      return Response.json(d);
    }
    if (view === "channels") return Response.json({ channels: await channelStatuses(t.tenantId), settings: await settingsFor(t.tenantId), intents: INTENTS, metaApp: metaAppConfigured(), canManage: t.role === "OWNER" || t.role === "ADMIN" });
    return Response.json(await listThreads(t.tenantId, { kind: cleanText(url.searchParams.get("kind"), 20), status: cleanText(url.searchParams.get("status"), 20), q: cleanText(url.searchParams.get("q"), 80) }));
  } catch (error) { console.error("messages.get_failed", error); return Response.json({ error: "Unable to load messages." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const t = await requireTenantAction(request, "edit"); if (t instanceof Response) return t;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = cleanText(body.action, 30); const threadId = cleanText(body.threadId, 80);
    const db = coreDb(); const now = new Date().toISOString();
    const manager = t.role === "OWNER" || t.role === "ADMIN";
    if (action === "send") {
      const r = await sendOutbound(t.tenantId, threadId, cleanText(body.body, 4000), t.email, { replyToCommentId: cleanText(body.replyToCommentId, 120) || null, privateReply: Boolean(body.privateReply) });
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    if (action === "approve") {
      const th = await db.prepare("SELECT draft FROM msg_threads WHERE id=? AND tenant_id=?").bind(threadId, t.tenantId).first<{ draft: string | null }>();
      const text = cleanText(body.body, 4000) || String(th?.draft || "");
      if (!text) return Response.json({ ok: false, detail: "There's no draft on this conversation." }, { status: 400 });
      const r = await sendOutbound(t.tenantId, threadId, text, t.email);
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    if (action === "dismiss") { await db.prepare("UPDATE msg_threads SET draft=NULL, updated_at=? WHERE id=? AND tenant_id=?").bind(now, threadId, t.tenantId).run(); return Response.json({ ok: true }); }
    if (action === "start") {
      const kind = cleanText(body.kind, 10); if (kind !== "EMAIL" && kind !== "SMS") return Response.json({ ok: false, detail: "New conversations can start by email or text. Social DMs have to come from the customer first." }, { status: 400 });
      const r = await startThread(t.tenantId, cleanText(body.contactId, 80), kind, cleanText(body.body, 4000), t.email, cleanText(body.subject, 200) || undefined);
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    if (action === "close" || action === "reopen") { await db.prepare("UPDATE msg_threads SET status=?, updated_at=? WHERE id=? AND tenant_id=?").bind(action === "close" ? "CLOSED" : "OPEN", now, threadId, t.tenantId).run(); return Response.json({ ok: true }); }
    if (action === "assign") { await db.prepare("UPDATE msg_threads SET assigned_to=?, updated_at=? WHERE id=? AND tenant_id=?").bind(cleanText(body.assignee, 254) || null, now, threadId, t.tenantId).run(); return Response.json({ ok: true }); }
    if (!manager) return Response.json({ error: "Only an owner or admin can change channels." }, { status: 403 });
    if (action === "settings") return Response.json({ ok: true, settings: await saveSettings(t.tenantId, body) });
    if (action === "connect_whatsapp") {
      const numberId = cleanText(body.phoneNumberId, 40).replace(/\D/g, ""); const token = cleanText(body.token, 600);
      if (!numberId || !token) return Response.json({ error: "Phone number ID and token are required." }, { status: 400 });
      const id = await upsertChannel(t.tenantId, { kind: "WHATSAPP", externalId: numberId, displayName: cleanText(body.displayName, 160) || `WhatsApp ${numberId.slice(-4)}`, accessToken: token });
      return Response.json({ ok: true, id });
    }
    if (action === "disconnect") { await disconnectChannel(t.tenantId, cleanText(body.channelId, 80)); return Response.json({ ok: true }); }
    return Response.json({ error: `Unknown action. Channels: ${CHANNEL_KINDS.join(", ")}` }, { status: 400 });
  } catch (error) { console.error("messages.post_failed", error); return Response.json({ error: "Unable to update messages." }, { status: 500 }); }
}
