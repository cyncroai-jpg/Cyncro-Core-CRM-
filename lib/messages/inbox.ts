/**
 * Cyncro Messages: one inbox for every channel a customer can write in on.
 *
 *   channel      receive                                  send
 *   INSTAGRAM    Meta webhook (DMs, comments, story)       Graph API with the connected Page token
 *   FACEBOOK     Meta webhook (Messenger, Page comments)   Graph API with the connected Page token
 *   WHATSAPP     Meta webhook (Cloud API)                  Graph API with the number's token
 *   SMS          Twilio webhook                            Twilio
 *   EMAIL        Cloudflare Email Routing → worker email() Resend / connected Gmail
 *   TIKTOK       not offered by TikTok to any software     —
 *   LINKEDIN     not offered by LinkedIn to any software   —
 *
 * Every inbound message links the sender to one CRM contact, lands in one
 * thread per person per channel, fires the INBOUND_MESSAGE / SOCIAL_COMMENT
 * automation triggers, and gets an intent + draft reply from Cyncro AI. Drafts
 * wait for a human unless the company turned auto-reply on for that intent,
 * and even then the guardrails below cap it to one reply per person per day,
 * never to one-word or emoji-only messages, and never after a stop word.
 */
import { env } from "cloudflare:workers";
import { coreDb } from "@/lib/core/db";
import { companySettings } from "@/lib/core/companySettings";
import { emitAutomationEvent } from "@/lib/automations/engine";
import { linkContact } from "@/lib/automations/link";
import { sendEmail, emailTransportStatus } from "@/lib/core/email";
import { sendSms, smsConfigured } from "@/lib/automations/sms";
import { graphSend, graphCommentReply, graphPrivateReply, metaAppConfigured } from "@/lib/messages/meta";

export type ChannelKind = "INSTAGRAM" | "FACEBOOK" | "WHATSAPP" | "SMS" | "EMAIL" | "TIKTOK" | "LINKEDIN";
export const CHANNEL_KINDS: ChannelKind[] = ["INSTAGRAM", "FACEBOOK", "WHATSAPP", "SMS", "EMAIL", "TIKTOK", "LINKEDIN"];
export const CHANNEL_LABEL: Record<ChannelKind, string> = { INSTAGRAM: "Instagram", FACEBOOK: "Facebook", WHATSAPP: "WhatsApp", SMS: "Text (SMS)", EMAIL: "Email", TIKTOK: "TikTok", LINKEDIN: "LinkedIn" };
export const INTENTS = ["PRICE", "BOOKING", "SUPPORT", "COMPLAINT", "COMPLIMENT", "SPAM", "OTHER"] as const;
export type Intent = (typeof INTENTS)[number];
const DRAFTABLE: Intent[] = ["PRICE", "BOOKING", "SUPPORT", "COMPLIMENT", "OTHER"];
const STOP_WORDS = /^\s*(stop|unsubscribe|leave me alone|don'?t (message|text|contact) me|remove me)\b/i;
const META_WINDOW_MS = 24 * 3_600_000;

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const cf = () => env as unknown as Record<string, string | undefined>;

export type Settings = { autoReply: boolean; autoIntents: Intent[]; maxPerDay: number; inboundAddress: string; signature: string };
const DEFAULT_SETTINGS: Settings = { autoReply: false, autoIntents: ["PRICE", "BOOKING"], maxPerDay: 1, inboundAddress: "", signature: "" };

export async function settingsFor(tenantId: string): Promise<Settings> {
  const r = await coreDb().prepare("SELECT settings_json FROM msg_settings WHERE tenant_id=?").bind(tenantId).first<{ settings_json: string }>();
  if (!r) return { ...DEFAULT_SETTINGS };
  try { const o = JSON.parse(r.settings_json) as Partial<Settings>; return { ...DEFAULT_SETTINGS, ...o, autoIntents: (o.autoIntents || DEFAULT_SETTINGS.autoIntents).filter((i) => (INTENTS as readonly string[]).includes(i)) as Intent[] }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export async function saveSettings(tenantId: string, patch: Partial<Settings>): Promise<Settings> {
  const cur = await settingsFor(tenantId);
  const next: Settings = {
    autoReply: patch.autoReply !== undefined ? Boolean(patch.autoReply) : cur.autoReply,
    autoIntents: Array.isArray(patch.autoIntents) ? (patch.autoIntents.filter((i) => (INTENTS as readonly string[]).includes(String(i))) as Intent[]) : cur.autoIntents,
    maxPerDay: patch.maxPerDay !== undefined ? Math.min(3, Math.max(0, Math.round(Number(patch.maxPerDay) || 0))) : cur.maxPerDay,
    inboundAddress: patch.inboundAddress !== undefined ? String(patch.inboundAddress).trim().toLowerCase().slice(0, 254) : cur.inboundAddress,
    signature: patch.signature !== undefined ? String(patch.signature).trim().slice(0, 300) : cur.signature,
  };
  await coreDb().prepare("INSERT INTO msg_settings (tenant_id, settings_json, updated_at) VALUES (?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET settings_json=excluded.settings_json, updated_at=excluded.updated_at").bind(tenantId, JSON.stringify(next), now()).run();
  return next;
}

// ── Channels (connected accounts) ──
export type Channel = { id: string; tenant_id: string; kind: ChannelKind; external_id: string; display_name: string; access_token: string | null; meta_user_id: string | null; status: string; created_at: string };
export async function channelsOf(tenantId: string): Promise<Channel[]> {
  return (await coreDb().prepare("SELECT * FROM msg_channels WHERE tenant_id=? AND status='ACTIVE' ORDER BY kind, created_at").bind(tenantId).all<Channel>()).results;
}
export async function upsertChannel(tenantId: string, c: { kind: ChannelKind; externalId: string; displayName: string; accessToken?: string | null; metaUserId?: string | null }): Promise<string> {
  const db = coreDb(); const t = now();
  const existing = await db.prepare("SELECT id FROM msg_channels WHERE tenant_id=? AND kind=? AND external_id=?").bind(tenantId, c.kind, c.externalId).first<{ id: string }>();
  if (existing) { await db.prepare("UPDATE msg_channels SET display_name=?, access_token=COALESCE(?, access_token), meta_user_id=COALESCE(?, meta_user_id), status='ACTIVE', updated_at=? WHERE id=?").bind(c.displayName.slice(0, 160), c.accessToken ?? null, c.metaUserId ?? null, t, existing.id).run(); return existing.id; }
  const id = uid();
  await db.prepare("INSERT INTO msg_channels (id, tenant_id, kind, external_id, display_name, access_token, meta_user_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,'ACTIVE',?,?)").bind(id, tenantId, c.kind, c.externalId, c.displayName.slice(0, 160), c.accessToken ?? null, c.metaUserId ?? null, t, t).run();
  return id;
}
export async function disconnectChannel(tenantId: string, id: string) {
  await coreDb().prepare("UPDATE msg_channels SET status='REMOVED', access_token=NULL, updated_at=? WHERE tenant_id=? AND id=?").bind(now(), tenantId, id).run();
}
/** Which company owns a Meta Page / Instagram account / WhatsApp number id. */
export async function channelByExternal(kind: ChannelKind, externalId: string): Promise<Channel | null> {
  return (await coreDb().prepare("SELECT * FROM msg_channels WHERE kind=? AND external_id=? AND status='ACTIVE' ORDER BY updated_at DESC LIMIT 1").bind(kind, externalId).first<Channel>()) || null;
}

export type ChannelStatus = { kind: ChannelKind; label: string; dm: boolean; state: "CONNECTED" | "NEEDS_SETUP" | "NEEDS_APP" | "NOT_AVAILABLE"; detail: string; accounts: { id: string; name: string }[]; action: "connect_meta" | "connect_whatsapp" | "email_routing" | "none" };
/** Honest per-channel status for the Channels panel: connected, needs the owner to connect, needs a platform credential, or not offered by that network at all. */
export async function channelStatuses(tenantId: string): Promise<ChannelStatus[]> {
  const rows = await channelsOf(tenantId); const st = await settingsFor(tenantId);
  const acc = (k: ChannelKind) => rows.filter((r) => r.kind === k).map((r) => ({ id: r.id, name: r.display_name }));
  const metaApp = metaAppConfigured();
  const email = await emailTransportStatus(tenantId);
  const social = (k: "INSTAGRAM" | "FACEBOOK"): ChannelStatus => {
    const a = acc(k);
    if (a.length) return { kind: k, label: CHANNEL_LABEL[k], dm: true, state: "CONNECTED", detail: `${a.length} account${a.length === 1 ? "" : "s"} receiving DMs and comments.`, accounts: a, action: "connect_meta" };
    if (metaApp) return { kind: k, label: CHANNEL_LABEL[k], dm: true, state: "NEEDS_SETUP", detail: k === "INSTAGRAM" ? "Connect the Facebook Page your Instagram business account is linked to." : "Connect your Facebook Page to receive Messenger and comments here.", accounts: [], action: "connect_meta" };
    return { kind: k, label: CHANNEL_LABEL[k], dm: true, state: "NEEDS_APP", detail: "The Cyncro Meta app isn't on this deployment yet. It's switched on once Meta's App Review approves messaging; nothing to do on your side until then.", accounts: [], action: "none" };
  };
  const wa = acc("WHATSAPP");
  return [
    social("INSTAGRAM"), social("FACEBOOK"),
    { kind: "WHATSAPP", label: "WhatsApp", dm: true, state: wa.length ? "CONNECTED" : "NEEDS_SETUP", detail: wa.length ? "Replies go out through the WhatsApp Cloud API. Outside 24 hours you need an approved template." : "Paste the Phone number ID and a permanent token from your WhatsApp Business account in Meta Business Manager.", accounts: wa, action: "connect_whatsapp" },
    { kind: "SMS", label: "Text (SMS)", dm: true, state: smsConfigured() ? "CONNECTED" : "NEEDS_APP", detail: smsConfigured() ? `Texts to ${cf().TWILIO_PHONE_NUMBER || "your number"} land here and replies go out from it.` : "Texting needs a Twilio number on this deployment. Until then, texts are logged on contacts but can't be answered from here.", accounts: smsConfigured() ? [{ id: "twilio", name: String(cf().TWILIO_PHONE_NUMBER || "Twilio number") }] : [], action: "none" },
    { kind: "EMAIL", label: "Email", dm: true, state: email.transport !== "none" ? "CONNECTED" : "NEEDS_SETUP", detail: email.transport !== "none" ? `Replies send from ${email.from}. To receive mail here, route ${st.inboundAddress || "an address on your domain"} to Cyncro with Cloudflare Email Routing.` : "Connect a sender first (Resend key, or 'Connect my Google' in Team Access). Then route an address on your domain to Cyncro to receive.", accounts: email.transport !== "none" ? [{ id: "email", name: email.from }] : [], action: "email_routing" },
    { kind: "TIKTOK", label: "TikTok", dm: false, state: "NOT_AVAILABLE", detail: "TikTok does not offer direct-message access to any software. Comment replies and lead forms arrive once Cyncro is approved as a TikTok Marketing Partner; posting lives in Growth.", accounts: [], action: "none" },
    { kind: "LINKEDIN", label: "LinkedIn", dm: false, state: "NOT_AVAILABLE", detail: "LinkedIn does not offer a messaging API. Company-page comments and lead forms come with the Community Management API approval; personal DMs can't be automated without risking the account.", accounts: [], action: "none" },
  ];
}

// ── Threads and messages ──
export type Inbound = {
  tenantId: string; kind: ChannelKind; channelId?: string | null;
  externalUserId: string;                      // PSID / IGSID / wa_id / phone digits / email
  name?: string | null; handle?: string | null; email?: string | null; phone?: string | null;
  body: string; subject?: string | null;
  messageKind?: "MESSAGE" | "COMMENT" | "STORY_REPLY" | "EMAIL";
  externalMessageId?: string | null; externalRef?: string | null; // comment id, post id
  at?: string | null;
};
export type Thread = Record<string, unknown> & { id: string; tenant_id: string; kind: ChannelKind; contact_id: string | null; external_user_id: string; last_inbound_at: string | null; opted_out: number; auto_reply_day: string | null; auto_replies_today: number; channel_id: string | null; display_name: string; subject: string | null };

async function findOrCreateContact(tenantId: string, inb: Inbound): Promise<string> {
  const linked = await linkContact(tenantId, { name: inb.name || inb.handle || inb.externalUserId, email: inb.email, phone: inb.phone, source: inb.kind });
  if (linked) return linked;
  // Social senders have no email or phone: one contact per handle, found again through the thread.
  const db = coreDb(); const t = now(); const id = uid();
  await db.prepare("INSERT INTO crm_contacts (id,full_name,email,phone,lifecycle,source,notes,tenant_id,created_at,updated_at) VALUES (?,?,NULL,NULL,'LEAD',?,?,?,?,?)")
    .bind(id, (inb.name || inb.handle || `${CHANNEL_LABEL[inb.kind]} user`).slice(0, 160), inb.kind, inb.handle ? `${CHANNEL_LABEL[inb.kind]}: @${inb.handle.replace(/^@/, "")}` : null, tenantId, t, t).run();
  return id;
}

/** Records an inbound message: contact, thread, message row, triggers, draft. Returns the thread id and what happened. */
export async function ingestInbound(inb: Inbound): Promise<{ threadId: string; messageId: string; duplicate: boolean; intent: Intent | null; autoSent: boolean }> {
  const db = coreDb(); const t = inb.at || now();
  if (inb.externalMessageId) {
    const dup = await db.prepare("SELECT id, thread_id FROM msg_messages WHERE tenant_id=? AND external_id=?").bind(inb.tenantId, inb.externalMessageId).first<{ id: string; thread_id: string }>();
    if (dup) return { threadId: dup.thread_id, messageId: dup.id, duplicate: true, intent: null, autoSent: false };
  }
  let thread = await db.prepare("SELECT * FROM msg_threads WHERE tenant_id=? AND kind=? AND external_user_id=?").bind(inb.tenantId, inb.kind, inb.externalUserId).first<Thread>();
  if (!thread) {
    const contactId = await findOrCreateContact(inb.tenantId, inb);
    const id = uid();
    await db.prepare("INSERT INTO msg_threads (id, tenant_id, kind, channel_id, contact_id, external_user_id, display_name, handle, subject, status, unread, last_message_at, last_inbound_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,'OPEN',0,?,?,?,?)")
      .bind(id, inb.tenantId, inb.kind, inb.channelId || null, contactId, inb.externalUserId, (inb.name || inb.handle || inb.externalUserId).slice(0, 160), inb.handle || null, inb.subject || null, t, t, t, t).run();
    thread = (await db.prepare("SELECT * FROM msg_threads WHERE id=?").bind(id).first<Thread>())!;
  }
  const body = inb.body.trim().slice(0, 4000);
  const optOut = STOP_WORDS.test(body);
  const messageId = uid();
  await db.prepare("INSERT INTO msg_messages (id, tenant_id, thread_id, direction, kind, body, external_id, external_ref, sent_by, status, created_at) VALUES (?,?,?,'IN',?,?,?,?,?,'RECEIVED',?)")
    .bind(messageId, inb.tenantId, thread.id, inb.messageKind || "MESSAGE", body, inb.externalMessageId || null, inb.externalRef || null, inb.name || inb.handle || inb.externalUserId, t).run();
  await db.prepare("UPDATE msg_threads SET status='OPEN', unread=unread+1, last_message_at=?, last_inbound_at=?, subject=COALESCE(subject, ?), channel_id=COALESCE(channel_id, ?), opted_out=CASE WHEN ?=1 THEN 1 ELSE opted_out END, draft=NULL, intent=NULL, updated_at=? WHERE id=?")
    .bind(t, t, inb.subject || null, inb.channelId || null, optOut ? 1 : 0, t, thread.id).run();
  if (thread.contact_id) {
    await db.prepare("INSERT INTO crm_activities (id,contact_id,activity_type,title,details,status,created_by,tenant_id,created_at,updated_at) VALUES (?,?,?,?,?,'COMPLETED','inbound',?,?,?)")
      .bind(uid(), thread.contact_id, inb.kind === "EMAIL" ? "EMAIL" : inb.kind === "SMS" ? "SMS" : "NOTE", `${CHANNEL_LABEL[inb.kind]} ${inb.messageKind === "COMMENT" ? "comment" : "message"} from ${thread.display_name}`, body.slice(0, 1000), inb.tenantId, t, t).run();
  }
  // Automations: one trigger for any inbound message, one for public comments.
  const ctx = { contactId: thread.contact_id, threadId: thread.id, channel: inb.kind, body, messageKind: inb.messageKind || "MESSAGE", externalRef: inb.externalRef || "", customerName: thread.display_name, customerEmail: inb.email || "", customerPhone: inb.phone || "" };
  await emitAutomationEvent(inb.tenantId, "INBOUND_MESSAGE", { ...ctx, trigger: "INBOUND_MESSAGE" }).catch(() => 0);
  if (inb.messageKind === "COMMENT") await emitAutomationEvent(inb.tenantId, "SOCIAL_COMMENT", { ...ctx, trigger: "SOCIAL_COMMENT" }).catch(() => 0);
  // Intent + draft, then the guarded auto-reply.
  let intent: Intent | null = null; let autoSent = false;
  if (!optOut) {
    try {
      const d = await classifyAndDraft(inb.tenantId, thread, body);
      intent = d.intent;
      await db.prepare("UPDATE msg_threads SET intent=?, draft=?, draft_at=?, needs_human=? WHERE id=?").bind(d.intent, d.draft || null, d.draft ? now() : null, d.intent === "COMPLAINT" ? 1 : 0, thread.id).run();
      if (d.draft) autoSent = await maybeAutoReply(inb.tenantId, thread.id, d.intent, d.draft, body, inb.messageKind || "MESSAGE");
    } catch (err) { console.warn("messages.draft_skipped", err instanceof Error ? err.message : err); }
  }
  return { threadId: thread.id, messageId, duplicate: false, intent, autoSent };
}

const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\s‍️!.?]+$/u;
/** Auto-reply only when the company turned it on for this intent, and never past the caps. Returns true when a reply went out. */
async function maybeAutoReply(tenantId: string, threadId: string, intent: Intent, draft: string, inboundBody: string, messageKind: string): Promise<boolean> {
  const st = await settingsFor(tenantId);
  if (!st.autoReply || !st.autoIntents.includes(intent) || st.maxPerDay <= 0) return false;
  if (inboundBody.replace(/\s+/g, "").length < 3 || EMOJI_ONLY.test(inboundBody) || (messageKind === "COMMENT" && inboundBody.split(/\s+/).length < 2)) return false;
  const db = coreDb(); const day = now().slice(0, 10);
  const th = await db.prepare("SELECT auto_reply_day, auto_replies_today, opted_out FROM msg_threads WHERE id=?").bind(threadId).first<{ auto_reply_day: string | null; auto_replies_today: number; opted_out: number }>();
  if (!th || th.opted_out) return false;
  const used = th.auto_reply_day === day ? Number(th.auto_replies_today || 0) : 0;
  if (used >= st.maxPerDay) return false;
  const r = await sendOutbound(tenantId, threadId, draft, "cyncro-ai", { auto: true });
  if (!r.ok) return false;
  await db.prepare("UPDATE msg_threads SET auto_reply_day=?, auto_replies_today=?, draft=NULL WHERE id=?").bind(day, used + 1, threadId).run();
  return true;
}

/** Sends a reply on the thread's own channel and records it. */
export async function sendOutbound(tenantId: string, threadId: string, text: string, by: string, opts: { auto?: boolean; replyToCommentId?: string | null; privateReply?: boolean } = {}): Promise<{ ok: boolean; detail: string; messageId?: string }> {
  const db = coreDb(); const t = now();
  const th = await db.prepare("SELECT * FROM msg_threads WHERE id=? AND tenant_id=?").bind(threadId, tenantId).first<Thread>();
  if (!th) return { ok: false, detail: "Thread not found." };
  const body = text.trim().slice(0, 4000); if (!body) return { ok: false, detail: "Nothing to send." };
  if (th.opted_out && opts.auto) return { ok: false, detail: "This person asked not to be messaged." };
  const st = await settingsFor(tenantId);
  const signed = st.signature && !opts.auto && th.kind !== "EMAIL" ? body : body;
  let result: { ok: boolean; detail: string; externalId?: string } = { ok: false, detail: "Channel can't send." };
  const channel = th.channel_id ? await db.prepare("SELECT * FROM msg_channels WHERE id=?").bind(th.channel_id).first<Channel>() : null;
  if (th.kind === "INSTAGRAM" || th.kind === "FACEBOOK" || th.kind === "WHATSAPP") {
    if (!channel?.access_token) result = { ok: false, detail: `${CHANNEL_LABEL[th.kind]} account is no longer connected.` };
    else if (opts.replyToCommentId && !opts.privateReply) result = await graphCommentReply(channel, opts.replyToCommentId, signed);
    else if (opts.replyToCommentId && opts.privateReply) result = await graphPrivateReply(channel, opts.replyToCommentId, signed);
    else if (th.last_inbound_at && Date.now() - new Date(th.last_inbound_at).getTime() > META_WINDOW_MS) result = { ok: false, detail: `Outside ${CHANNEL_LABEL[th.kind]}'s 24-hour reply window. You can reply again once they message you${th.kind === "WHATSAPP" ? ", or send an approved template" : ""}.` };
    else result = await graphSend(channel, th.external_user_id, signed);
  } else if (th.kind === "SMS") {
    const r = await sendSms(th.external_user_id, signed); result = { ok: r.sent, detail: r.detail };
  } else if (th.kind === "EMAIL") {
    const esc = (x: string) => x.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">${signed.split("\n").map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join("")}${st.signature ? `<p style="color:#666">${esc(st.signature)}</p>` : ""}</div>`;
    const subject = th.subject ? (th.last_inbound_at && !/^re:/i.test(th.subject) ? `Re: ${th.subject}` : th.subject) : "Message from our team";
    const ok = await sendEmail({ to: th.external_user_id, subject, html, tenantId });
    result = { ok, detail: ok ? "Email sent" : "No email sender connected" };
  } else result = { ok: false, detail: `${CHANNEL_LABEL[th.kind]} doesn't offer messaging to software.` };
  const messageId = uid();
  await db.prepare("INSERT INTO msg_messages (id, tenant_id, thread_id, direction, kind, body, external_id, external_ref, sent_by, status, error, created_at) VALUES (?,?,?,'OUT',?,?,?,?,?,?,?,?)")
    .bind(messageId, tenantId, threadId, opts.replyToCommentId ? (opts.privateReply ? "PRIVATE_REPLY" : "COMMENT") : "MESSAGE", body, result.externalId || null, opts.replyToCommentId || null, by, result.ok ? "SENT" : "FAILED", result.ok ? null : result.detail.slice(0, 300), t).run();
  if (result.ok) await db.prepare("UPDATE msg_threads SET last_message_at=?, unread=0, draft=NULL, needs_human=0, updated_at=? WHERE id=?").bind(t, t, threadId).run();
  if (result.ok && th.contact_id) await db.prepare("INSERT INTO crm_activities (id,contact_id,activity_type,title,details,status,created_by,tenant_id,created_at,updated_at) VALUES (?,?,?,?,?,'COMPLETED',?,?,?,?)").bind(uid(), th.contact_id, th.kind === "EMAIL" ? "EMAIL" : th.kind === "SMS" ? "SMS" : "NOTE", `${CHANNEL_LABEL[th.kind]} reply${opts.auto ? " (Cyncro AI, auto)" : ""}`, body.slice(0, 1000), by, tenantId, t, t).run();
  return { ok: result.ok, detail: result.detail, messageId };
}

/** Starts a brand-new thread to a contact on a channel that allows it (email or text). Social DMs can't be started by software. */
export async function startThread(tenantId: string, contactId: string, kind: "EMAIL" | "SMS", text: string, by: string, subject?: string): Promise<{ ok: boolean; detail: string; threadId?: string }> {
  const db = coreDb(); const t = now();
  const c = await db.prepare("SELECT full_name, email, phone FROM crm_contacts WHERE id=? AND tenant_id=?").bind(contactId, tenantId).first<{ full_name: string; email: string | null; phone: string | null }>();
  if (!c) return { ok: false, detail: "Contact not found." };
  const key = kind === "EMAIL" ? String(c.email || "").toLowerCase() : String(c.phone || "").replace(/\D/g, "");
  if (!key) return { ok: false, detail: kind === "EMAIL" ? "This contact has no email." : "This contact has no phone." };
  let th = await db.prepare("SELECT id FROM msg_threads WHERE tenant_id=? AND kind=? AND external_user_id=?").bind(tenantId, kind, key).first<{ id: string }>();
  if (!th) {
    const id = uid();
    await db.prepare("INSERT INTO msg_threads (id, tenant_id, kind, channel_id, contact_id, external_user_id, display_name, handle, subject, status, unread, last_message_at, last_inbound_at, created_at, updated_at) VALUES (?,?,?,NULL,?,?,?,NULL,?,'OPEN',0,?,NULL,?,?)")
      .bind(id, tenantId, kind, contactId, key, c.full_name, subject || null, t, t, t).run();
    th = { id };
  }
  const r = await sendOutbound(tenantId, th.id, text, by);
  return { ...r, threadId: th.id };
}

// ── Cyncro AI: intent + draft ──
async function classifyAndDraft(tenantId: string, thread: Thread, body: string): Promise<{ intent: Intent; draft: string }> {
  const key = cf().ANTHROPIC_API_KEY; if (!key) return { intent: heuristicIntent(body), draft: "" };
  const st = await companySettings(tenantId);
  const usage = await coreDb().prepare("SELECT calls FROM ai_usage WHERE tenant_id=? AND month=?").bind(tenantId, now().slice(0, 7)).first<{ calls: number }>();
  if (Number(usage?.calls || 0) >= st.aiMonthlyCap) return { intent: heuristicIntent(body), draft: "" };
  const tenant = await coreDb().prepare("SELECT name FROM tenants WHERE id=?").bind(tenantId).first<{ name: string }>();
  const recent = (await coreDb().prepare("SELECT direction, body FROM msg_messages WHERE thread_id=? ORDER BY created_at DESC LIMIT 6").bind(thread.id).all<{ direction: string; body: string }>()).results.reverse();
  const company = st.brandName || tenant?.name || "the business";
  const system = `You draft replies for ${company}${st.bookingIntro ? ` (${st.bookingIntro})` : ""} to messages customers send on ${CHANNEL_LABEL[thread.kind]}.
Classify the latest message as one of ${INTENTS.join(", ")} and write a short, warm, human reply in the business's voice (1-3 sentences, no hashtags, no emojis unless the customer used them, never mention AI).
Rules: PRICE → give what you know or offer to send details; BOOKING → offer to book and ask for a day/time${st.website ? `, booking page ${st.website}` : ""}; SUPPORT/OTHER → helpful answer or a clarifying question; COMPLIMENT → one-line thank you; COMPLAINT → empty draft (a human will answer); SPAM → empty draft.
Business facts: phone ${st.phone || "n/a"}, website ${st.website || "n/a"}, address ${st.address || "n/a"}.
Respond with JSON only: {"intent":"...","draft":"..."}`;
  const base = (cf().ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
  const r = await fetch(`${base}/v1/messages`, { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: cf().CYNCRO_AI_MODEL || "claude-opus-5", max_tokens: 300, system, messages: [{ role: "user", content: `Conversation so far:\n${recent.map((m) => `${m.direction === "IN" ? "Customer" : "Us"}: ${m.body}`).join("\n")}\n\nLatest customer message: ${body}` }] }) });
  const data = (await r.json().catch(() => ({}))) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  if (!r.ok) throw new Error(`AI draft failed (${r.status})`);
  await coreDb().prepare("INSERT INTO ai_usage (tenant_id, month, calls, input_tokens, output_tokens) VALUES (?,?,1,?,?) ON CONFLICT(tenant_id, month) DO UPDATE SET calls=calls+1, input_tokens=input_tokens+excluded.input_tokens, output_tokens=output_tokens+excluded.output_tokens").bind(tenantId, now().slice(0, 7), Number(data.usage?.input_tokens || 0), Number(data.usage?.output_tokens || 0)).run();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("");
  const m = text.match(/\{[\s\S]*\}/);
  try {
    const o = JSON.parse(m ? m[0] : text) as { intent?: string; draft?: string };
    const intent = (INTENTS as readonly string[]).includes(String(o.intent)) ? (o.intent as Intent) : "OTHER";
    return { intent, draft: DRAFTABLE.includes(intent) ? String(o.draft || "").trim().slice(0, 1000) : "" };
  } catch { return { intent: heuristicIntent(body), draft: "" }; }
}
function heuristicIntent(body: string): Intent {
  const b = body.toLowerCase();
  if (/\b(price|cost|how much|quote|rate|pricing|\$)\b/.test(b)) return "PRICE";
  if (/\b(book|appointment|schedule|available|availability|slot|come in|visit)\b/.test(b)) return "BOOKING";
  if (/\b(refund|terrible|worst|angry|complain|never again|scam|rude)\b/.test(b)) return "COMPLAINT";
  if (/\b(love|amazing|great job|thank you|thanks|awesome)\b/.test(b)) return "COMPLIMENT";
  if (/\b(crypto|forex|make \$|dm me to earn|promo code|follow back)\b/.test(b)) return "SPAM";
  return "OTHER";
}

// ── Reads for the inbox UI ──
export async function listThreads(tenantId: string, f: { kind?: string; status?: string; q?: string; limit?: number }) {
  const where = ["t.tenant_id=?"]; const vals: unknown[] = [tenantId];
  if (f.kind && CHANNEL_KINDS.includes(f.kind as ChannelKind)) { where.push("t.kind=?"); vals.push(f.kind); }
  if (f.status === "OPEN" || f.status === "CLOSED") { where.push("t.status=?"); vals.push(f.status); }
  if (f.status === "NEEDS_HUMAN") where.push("(t.needs_human=1 OR t.intent='COMPLAINT')");
  if (f.q) { where.push("(t.display_name LIKE ? OR t.handle LIKE ? OR t.external_user_id LIKE ?)"); vals.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`); }
  vals.push(Math.min(200, f.limit || 80));
  const rows = (await coreDb().prepare(`SELECT t.*, (SELECT body FROM msg_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS preview, (SELECT direction FROM msg_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_direction, c.email AS contact_email, c.phone AS contact_phone FROM msg_threads t LEFT JOIN crm_contacts c ON c.id=t.contact_id WHERE ${where.join(" AND ")} ORDER BY t.last_message_at DESC LIMIT ?`).bind(...vals).all<Record<string, unknown>>()).results;
  const counts = (await coreDb().prepare("SELECT kind, COUNT(*) AS n, SUM(unread) AS unread FROM msg_threads WHERE tenant_id=? AND status='OPEN' GROUP BY kind").bind(tenantId).all<{ kind: string; n: number; unread: number }>()).results;
  return { threads: rows.map((r) => ({ ...r, window_open: !["INSTAGRAM", "FACEBOOK", "WHATSAPP"].includes(String(r.kind)) || (r.last_inbound_at ? Date.now() - new Date(String(r.last_inbound_at)).getTime() < META_WINDOW_MS : false) })), counts };
}
export async function threadDetail(tenantId: string, id: string) {
  const db = coreDb();
  const th = await db.prepare("SELECT t.*, c.full_name AS contact_name, c.email AS contact_email, c.phone AS contact_phone, c.lifecycle AS contact_lifecycle FROM msg_threads t LEFT JOIN crm_contacts c ON c.id=t.contact_id WHERE t.id=? AND t.tenant_id=?").bind(id, tenantId).first<Record<string, unknown>>();
  if (!th) return null;
  const messages = (await db.prepare("SELECT id, direction, kind, body, external_ref, sent_by, status, error, created_at FROM msg_messages WHERE thread_id=? ORDER BY created_at ASC LIMIT 300").bind(id).all<Record<string, unknown>>()).results;
  await db.prepare("UPDATE msg_threads SET unread=0 WHERE id=?").bind(id).run();
  const meta = ["INSTAGRAM", "FACEBOOK", "WHATSAPP"].includes(String(th.kind));
  const windowEndsAt = meta && th.last_inbound_at ? new Date(new Date(String(th.last_inbound_at)).getTime() + META_WINDOW_MS).toISOString() : null;
  return { thread: { ...th, window_open: !meta || (windowEndsAt ? new Date(windowEndsAt).getTime() > Date.now() : false), window_ends_at: windowEndsAt }, messages };
}
