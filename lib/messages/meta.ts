/**
 * Meta Graph API: Facebook Pages (Messenger + comments), Instagram business
 * accounts (DMs + comments) and WhatsApp Cloud API numbers.
 *
 * Secrets on the deployment: META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN
 * (any string you also paste into the webhook settings). META_API_BASE and
 * META_OAUTH_BASE exist so the test suite can point at a mock.
 */
import { env } from "cloudflare:workers";

const cf = () => env as unknown as Record<string, string | undefined>;
export const GRAPH_VERSION = "v21.0";
export const graphBase = () => (cf().META_API_BASE || `https://graph.facebook.com/${GRAPH_VERSION}`).replace(/\/$/, "");
export const oauthBase = () => (cf().META_OAUTH_BASE || `https://www.facebook.com/${GRAPH_VERSION}`).replace(/\/$/, "");
export const metaAppConfigured = () => Boolean(cf().META_APP_ID && cf().META_APP_SECRET);
export const metaAppId = () => String(cf().META_APP_ID || "");
export const metaVerifyToken = () => String(cf().META_VERIFY_TOKEN || "");
/** Permissions the Cyncro Meta app asks for; keep in step with what App Review approved. */
export const META_SCOPES = ["pages_show_list", "pages_messaging", "pages_manage_engagement", "pages_read_engagement", "pages_manage_metadata", "instagram_basic", "instagram_manage_messages", "instagram_manage_comments", "business_management"];

type ChannelLike = { kind: string; external_id: string; access_token: string | null };
type GraphResult = { ok: boolean; detail: string; externalId?: string };

async function hmacHex(secret: string, data: string | ArrayBuffer): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, typeof data === "string" ? new TextEncoder().encode(data) : data);
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** X-Hub-Signature-256 check on the raw webhook body. */
export async function verifyMetaSignature(rawBody: string, header: string | null): Promise<boolean> {
  const secret = cf().META_APP_SECRET; if (!secret) return false;
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = await hmacHex(secret, rawBody);
  const got = header.slice(7);
  if (expected.length !== got.length) return false;
  let diff = 0; for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
/** Signed OAuth state so the callback can't be pointed at another company. */
export async function signState(tenantId: string): Promise<string> {
  const nonce = crypto.randomUUID().slice(0, 8); const ts = Date.now().toString(36);
  const sig = (await hmacHex(String(cf().META_APP_SECRET || ""), `${tenantId}.${nonce}.${ts}`)).slice(0, 32);
  return btoa(`${tenantId}.${nonce}.${ts}.${sig}`).replace(/=+$/, "");
}
export async function readState(state: string): Promise<string | null> {
  try {
    const [tenantId, nonce, ts, sig] = atob(state).split(".");
    if (!tenantId || !nonce || !ts || !sig) return null;
    if (Date.now() - parseInt(ts, 36) > 30 * 60_000) return null;
    const expected = (await hmacHex(String(cf().META_APP_SECRET || ""), `${tenantId}.${nonce}.${ts}`)).slice(0, 32);
    return expected === sig ? tenantId : null;
  } catch { return null; }
}
/** Meta's signed_request (deauthorize + data deletion callbacks): base64url(sig).base64url(payload). */
export async function parseSignedRequest(signed: string): Promise<{ user_id?: string } | null> {
  const [sigB64, payloadB64] = signed.split(".");
  if (!sigB64 || !payloadB64) return null;
  const fromB64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  const sigHex = [...fromB64url(sigB64)].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  const expected = await hmacHex(String(cf().META_APP_SECRET || ""), payloadB64);
  if (sigHex !== expected) return null;
  try { return JSON.parse(fromB64url(payloadB64)) as { user_id?: string }; } catch { return null; }
}

async function graph(path: string, token: string, init?: { method?: string; body?: Record<string, unknown>; query?: Record<string, string> }) {
  const url = new URL(`${graphBase()}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(init?.query || {})) url.searchParams.set(k, v);
  const r = await fetch(url.toString(), { method: init?.method || "GET", headers: init?.body ? { "content-type": "application/json" } : undefined, body: init?.body ? JSON.stringify(init.body) : undefined });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; code?: number } };
  return { ok: r.ok && !data.error, status: r.status, data, error: data.error?.message || (r.ok ? "" : `Meta ${r.status}`) };
}

export async function graphSend(channel: ChannelLike, recipientId: string, text: string): Promise<GraphResult> {
  const token = String(channel.access_token || "");
  if (channel.kind === "WHATSAPP") {
    const r = await graph(`${channel.external_id}/messages`, token, { method: "POST", body: { messaging_product: "whatsapp", recipient_type: "individual", to: recipientId, type: "text", text: { body: text } } });
    const id = (r.data.messages as { id?: string }[] | undefined)?.[0]?.id;
    return r.ok ? { ok: true, detail: "Sent on WhatsApp", externalId: id } : { ok: false, detail: r.error };
  }
  const r = await graph(`${channel.external_id}/messages`, token, { method: "POST", body: { recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text } } });
  return r.ok ? { ok: true, detail: `Sent on ${channel.kind === "INSTAGRAM" ? "Instagram" : "Messenger"}`, externalId: String(r.data.message_id || "") } : { ok: false, detail: r.error };
}
/** Public reply under the customer's comment. */
export async function graphCommentReply(channel: ChannelLike, commentId: string, text: string): Promise<GraphResult> {
  const token = String(channel.access_token || "");
  const r = channel.kind === "INSTAGRAM"
    ? await graph(`${commentId}/replies`, token, { method: "POST", body: { message: text } })
    : await graph(`${commentId}/comments`, token, { method: "POST", body: { message: text } });
  return r.ok ? { ok: true, detail: "Replied to the comment", externalId: String(r.data.id || "") } : { ok: false, detail: r.error };
}
/** DM sent in response to a comment (the comment-to-conversation move). One per comment, by Meta's rules. */
export async function graphPrivateReply(channel: ChannelLike, commentId: string, text: string): Promise<GraphResult> {
  const token = String(channel.access_token || "");
  const r = await graph(`${channel.external_id}/messages`, token, { method: "POST", body: { recipient: { comment_id: commentId }, message: { text } } });
  return r.ok ? { ok: true, detail: "Private reply sent", externalId: String(r.data.message_id || "") } : { ok: false, detail: r.error };
}
/** Name and handle of a Messenger / Instagram sender. Best effort. */
export async function graphProfile(channel: ChannelLike, userId: string): Promise<{ name: string; handle: string }> {
  const token = String(channel.access_token || "");
  const r = await graph(userId, token, { query: { fields: channel.kind === "INSTAGRAM" ? "name,username" : "name,first_name,last_name" } });
  if (!r.ok) return { name: "", handle: "" };
  return { name: String(r.data.name || [r.data.first_name, r.data.last_name].filter(Boolean).join(" ") || ""), handle: String(r.data.username || "") };
}

// ── OAuth: user code → long-lived token → pages (+ linked Instagram) ──
export type MetaPage = { id: string; name: string; access_token: string; instagram?: { id: string; username: string } };
export async function exchangeCode(code: string, redirectUri: string): Promise<{ userToken: string; userId: string; userName: string }> {
  const appId = String(cf().META_APP_ID || ""); const secret = String(cf().META_APP_SECRET || "");
  const first = await graph("oauth/access_token", "", { query: { client_id: appId, client_secret: secret, redirect_uri: redirectUri, code } });
  if (!first.ok) throw new Error(first.error || "Facebook didn't accept the login.");
  const longLived = await graph("oauth/access_token", "", { query: { grant_type: "fb_exchange_token", client_id: appId, client_secret: secret, fb_exchange_token: String(first.data.access_token) } });
  const userToken = String((longLived.ok ? longLived.data.access_token : first.data.access_token) || "");
  const me = await graph("me", userToken, { query: { fields: "id,name" } });
  return { userToken, userId: String(me.data.id || ""), userName: String(me.data.name || "") };
}
export async function listPages(userToken: string): Promise<MetaPage[]> {
  const r = await graph("me/accounts", userToken, { query: { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "50" } });
  if (!r.ok) throw new Error(r.error || "Couldn't read your Pages.");
  return ((r.data.data as Record<string, unknown>[]) || []).map((p) => ({ id: String(p.id), name: String(p.name), access_token: String(p.access_token), instagram: p.instagram_business_account ? { id: String((p.instagram_business_account as { id: string }).id), username: String((p.instagram_business_account as { username?: string }).username || "") } : undefined }));
}
/** Tells Meta to send this Page's messages, comments and Instagram events to our webhook. */
export async function subscribePage(page: MetaPage): Promise<boolean> {
  const r = await graph(`${page.id}/subscribed_apps`, page.access_token, { method: "POST", body: { subscribed_fields: ["messages", "messaging_postbacks", "message_echoes", "feed"] } });
  return r.ok;
}
