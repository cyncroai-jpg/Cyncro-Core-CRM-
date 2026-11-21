"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Thread = Record<string, unknown> & { id: string; kind: string; display_name: string; handle: string | null; preview: string | null; last_direction: string | null; last_message_at: string | null; unread: number; intent: string | null; draft: string | null; needs_human: number; status: string; window_open: boolean; contact_id: string | null; contact_email?: string | null; contact_phone?: string | null; opted_out: number; subject?: string | null; window_ends_at?: string | null };
type Msg = { id: string; direction: "IN" | "OUT"; kind: string; body: string; external_ref: string | null; sent_by: string | null; status: string; error: string | null; created_at: string };
type ChannelStatus = { kind: string; label: string; dm: boolean; state: "CONNECTED" | "NEEDS_SETUP" | "NEEDS_APP" | "NOT_AVAILABLE"; detail: string; accounts: { id: string; name: string }[]; action: string };
type Settings = { autoReply: boolean; autoIntents: string[]; maxPerDay: number; inboundAddress: string; signature: string };
type ChannelsData = { channels: ChannelStatus[]; settings: Settings; intents: string[]; metaApp: boolean; canManage: boolean };

const ICON: Record<string, string> = { INSTAGRAM: "◎", FACEBOOK: "f", WHATSAPP: "✆", SMS: "▭", EMAIL: "✉", TIKTOK: "♪", LINKEDIN: "in" };
const INTENT_LABEL: Record<string, string> = { PRICE: "Price question", BOOKING: "Wants to book", SUPPORT: "Needs help", COMPLAINT: "Complaint", COMPLIMENT: "Compliment", SPAM: "Spam", OTHER: "Question" };
const ago = (iso: string | null) => { if (!iso) return ""; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); if (m < 1) return "now"; if (m < 60) return `${m}m`; if (m < 1440) return `${Math.round(m / 60)}h`; return `${Math.round(m / 1440)}d`; };
const post = async (body: Record<string, unknown>) => { const r = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = (await r.json().catch(() => ({}))) as Record<string, unknown>; return { ok: r.ok, d }; };

/** Customer conversations from every channel, one CRM contact per person, AI drafts that wait for a human. */
export function MessagesInbox() {
  const [view, setView] = useState<"inbox" | "channels">("inbox");
  const [kind, setKind] = useState<string>("");
  const [status, setStatus] = useState<string>("OPEN");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [counts, setCounts] = useState<{ kind: string; n: number; unread: number }[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ thread: Thread; messages: Msg[] } | null>(null);
  const [text, setText] = useState("");
  const [draftEdit, setDraftEdit] = useState<string | null>(null);
  const [flash, setFlash] = useState("");
  const [channels, setChannels] = useState<ChannelsData | null>(null);
  const [wa, setWa] = useState({ phoneNumberId: "", token: "", displayName: "" });
  const [busy, setBusy] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  type Hit = { id: string; full_name: string; email: string | null; phone: string | null };
  const [compose, setCompose] = useState<{ contact: Hit | null; kind: "EMAIL" | "SMS"; subject: string; body: string; q: string; hits: Hit[] } | null>(null);
  const openCompose = (contact: Hit | null, kind: "EMAIL" | "SMS" = "EMAIL") => setCompose({ contact, kind, subject: "", body: "", q: "", hits: [] });
  const searchContacts = async (q: string) => { setCompose((c) => (c ? { ...c, q } : c)); if (q.trim().length < 2) return; const r = await fetch(`/api/crm/contacts?q=${encodeURIComponent(q.trim())}`); if (!r.ok) return; const d = (await r.json()) as { contacts: Hit[] }; setCompose((c) => (c && c.q === q ? { ...c, hits: (d.contacts || []).slice(0, 8) } : c)); };
  const startNew = async () => {
    if (!compose?.contact) return say("Pick a contact first");
    if (!compose.body.trim()) return say("Write the message first");
    setBusy("start"); const { ok, d } = await post({ action: "start", contactId: compose.contact.id, kind: compose.kind, subject: compose.subject, body: compose.body }); setBusy("");
    if (!ok) return say(String(d.detail || d.error || "Could not send"));
    setCompose(null); setView("inbox"); setStatus("OPEN"); setKind(""); await loadThreads(); if (d.threadId) setSel(String(d.threadId)); say(String(d.detail || "Sent"));
  };
  const say = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(""), 3500); };

  const loadThreads = useCallback(async () => { const r = await fetch(`/api/messages?view=threads&kind=${kind}&status=${status}`); if (r.ok) { const d = await r.json(); setThreads(d.threads || []); setCounts(d.counts || []); } }, [kind, status]);
  const loadDetail = useCallback(async (id: string) => { const r = await fetch(`/api/messages?view=thread&id=${id}`); if (r.ok) { setDetail(await r.json()); setDraftEdit(null); } }, []);
  const loadChannels = useCallback(async () => { const r = await fetch("/api/messages?view=channels"); if (r.ok) setChannels(await r.json()); }, []);
  useEffect(() => { void loadThreads(); const t = window.setInterval(() => void loadThreads(), 15000); return () => window.clearInterval(t); }, [loadThreads]);
  useEffect(() => { if (sel) void loadDetail(sel); }, [sel, loadDetail]);
  useEffect(() => { void loadChannels(); }, [loadChannels]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [detail?.messages.length]);
  useEffect(() => { const h = window.location.hash; if (/connected=meta/.test(h)) { const m = h.match(/accounts=(\d+)/); const e = h.match(/error=([^&]+)/); say(e ? `Facebook connection failed: ${decodeURIComponent(e[1])}` : `Connected ${m ? m[1] : ""} account${m && m[1] === "1" ? "" : "s"} from Facebook`); setView("channels"); window.history.replaceState(null, "", "#messages"); } }, []);

  const send = async (override?: string, extra: Record<string, unknown> = {}) => {
    if (!sel) return; const body = (override ?? text).trim(); if (!body) return;
    setBusy("send"); const { ok, d } = await post({ action: override !== undefined && !extra.replyToCommentId ? "approve" : "send", threadId: sel, body, ...extra }); setBusy("");
    if (!ok) return say(String(d.detail || d.error || "Could not send"));
    setText(""); setDraftEdit(null); await loadDetail(sel); await loadThreads(); say(String(d.detail || "Sent"));
  };
  const act = async (action: string, extra: Record<string, unknown> = {}) => { if (!sel) return; const { ok, d } = await post({ action, threadId: sel, ...extra }); if (!ok) return say(String(d.detail || d.error || "Could not do that")); await loadDetail(sel); await loadThreads(); };
  const saveSettings = async (patch: Partial<Settings>) => { setBusy("settings"); const { ok, d } = await post({ action: "settings", ...patch }); setBusy(""); if (!ok) return say(String(d.error || "Could not save")); await loadChannels(); say("Saved"); };
  const connectMeta = async () => { const r = await fetch("/api/messages/meta?step=start&format=json"); const d = await r.json().catch(() => ({})); if (!r.ok || !d.url) return say(d.error || "Facebook connection isn't available yet"); window.location.href = d.url; };
  const connectWa = async () => { setBusy("wa"); const { ok, d } = await post({ action: "connect_whatsapp", ...wa }); setBusy(""); if (!ok) return say(String(d.error || "Could not connect")); setWa({ phoneNumberId: "", token: "", displayName: "" }); await loadChannels(); say("WhatsApp number connected"); };

  const t = detail?.thread; const lastInbound = detail?.messages.filter((m) => m.direction === "IN").slice(-1)[0];
  const unreadTotal = counts.reduce((a, c) => a + Number(c.unread || 0), 0);
  return (
    <div className="mxShell">
      <header className="mxTop">
        <div><small>CYNCRO MESSAGES</small><h1>Customer conversations</h1><p>Instagram, Facebook, WhatsApp, text and email in one place. Every person is one CRM contact. Cyncro drafts, you approve.</p></div>
        <nav>
          <button className={view === "inbox" ? "on" : ""} onClick={() => setView("inbox")}>Inbox{unreadTotal ? <i>{unreadTotal}</i> : null}</button>
          <button className={view === "channels" ? "on" : ""} onClick={() => setView("channels")}>Channels &amp; rules</button>
        </nav>
      </header>
      {flash && <div className="mxFlash">{flash}</div>}
      {view === "channels" && channels && (
        <section className="mxChannels">
          <div className="mxChannelGrid">
            {channels.channels.map((c) => (
              <article key={c.kind} className={`mxChannel ${c.state.toLowerCase()}`}>
                <header><span className="mxIcon" data-kind={c.kind}>{ICON[c.kind]}</span><div><b>{c.label}</b><small>{c.state === "CONNECTED" ? "Connected" : c.state === "NEEDS_SETUP" ? "Ready to connect" : c.state === "NEEDS_APP" ? "Waiting on platform access" : "No DM access from this network"}</small></div><em className={`fxPill ${c.state === "CONNECTED" ? "green" : c.state === "NOT_AVAILABLE" ? "" : "amber"}`}>{c.dm ? (c.state === "CONNECTED" ? "LIVE" : c.state === "NEEDS_SETUP" ? "CONNECT" : "PENDING") : "NOT OFFERED"}</em></header>
                <p>{c.detail}</p>
                {c.accounts.length > 0 && <ul>{c.accounts.map((a) => <li key={a.id}><span>{a.name}</span>{channels.canManage && (c.kind === "INSTAGRAM" || c.kind === "FACEBOOK" || c.kind === "WHATSAPP") && <button onClick={() => void post({ action: "disconnect", channelId: a.id }).then(loadChannels)}>Disconnect</button>}</li>)}</ul>}
                {channels.canManage && c.action === "connect_meta" && c.state !== "NEEDS_APP" && <button className="coSave" onClick={() => void connectMeta()}>{c.accounts.length ? "Connect another Page" : "Connect with Facebook"}</button>}
                {channels.canManage && c.action === "connect_whatsapp" && (
                  <div className="mxWaForm">
                    <input value={wa.displayName} onChange={(e) => setWa({ ...wa, displayName: e.target.value })} placeholder="Label (e.g. Main line)" />
                    <input value={wa.phoneNumberId} onChange={(e) => setWa({ ...wa, phoneNumberId: e.target.value })} placeholder="Phone number ID" />
                    <input value={wa.token} onChange={(e) => setWa({ ...wa, token: e.target.value })} placeholder="Permanent access token" type="password" />
                    <button className="coSave" disabled={busy === "wa" || !wa.phoneNumberId || !wa.token} onClick={() => void connectWa()}>Connect WhatsApp number</button>
                    <small>Webhook for Meta: <code>{typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/meta` : "/api/webhooks/meta"}</code></small>
                  </div>
                )}
                {c.action === "email_routing" && channels.canManage && (
                  <div className="mxWaForm">
                    <input value={channels.settings.inboundAddress} onChange={(e) => setChannels({ ...channels, settings: { ...channels.settings, inboundAddress: e.target.value } })} placeholder="inbox@yourdomain.com" />
                    <button className="coSave" disabled={busy === "settings"} onClick={() => void saveSettings({ inboundAddress: channels.settings.inboundAddress })}>Save receiving address</button>
                    <small>In Cloudflare: Email → Email Routing → add this address → Send to Worker → cyncro-core-crm.</small>
                  </div>
                )}
              </article>
            ))}
          </div>
          <article className="mxRules">
            <header><div><b>Reply rules</b><small>What Cyncro may answer on its own. Everything else waits in the inbox as a draft.</small></div>{channels.canManage && <button className={`fxLendSwitch ${channels.settings.autoReply ? "on" : ""}`} aria-label="Auto-reply" onClick={() => void saveSettings({ autoReply: !channels.settings.autoReply })}><i /></button>}</header>
            <div className="mxRuleRow">
              <span>Auto-reply to</span>
              <div className="mxIntents">{channels.intents.filter((i) => !["SPAM", "COMPLAINT"].includes(i)).map((i) => <label key={i}><input type="checkbox" disabled={!channels.canManage} checked={channels.settings.autoIntents.includes(i)} onChange={(e) => void saveSettings({ autoIntents: e.target.checked ? [...channels.settings.autoIntents, i] : channels.settings.autoIntents.filter((x) => x !== i) })} /> {INTENT_LABEL[i]}</label>)}</div>
            </div>
            <div className="mxRuleRow"><span>Max auto-replies per person per day</span><select disabled={!channels.canManage} value={channels.settings.maxPerDay} onChange={(e) => void saveSettings({ maxPerDay: Number(e.target.value) })}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
            <div className="mxRuleRow"><span>Signature on email replies</span><input disabled={!channels.canManage} defaultValue={channels.settings.signature} onBlur={(e) => { if (e.target.value !== channels.settings.signature) void saveSettings({ signature: e.target.value }); }} placeholder="— Dana, Summit Air & Heat" /></div>
            <ul className="mxAlways">
              <li>Complaints and spam are never auto-answered. Complaints are flagged for a person.</li>
              <li>No reply to one-word or emoji-only messages, and never twice without the customer writing back.</li>
              <li>"Stop" or "unsubscribe" ends automation for that person on that channel.</li>
              <li>Instagram, Facebook and WhatsApp allow replies for 24 hours after the customer's last message. The clock shows on each thread.</li>
              <li>Cyncro never starts a social DM. Only email and text conversations can be started from here.</li>
            </ul>
          </article>
        </section>
      )}
      {view === "inbox" && (
        <section className="mxInbox">
          <aside className="mxList">
            <div className="mxFilters">
              <button className={kind === "" ? "on" : ""} onClick={() => setKind("")}>All</button>
              {["INSTAGRAM", "FACEBOOK", "WHATSAPP", "SMS", "EMAIL"].map((k) => { const c = counts.find((x) => x.kind === k); return <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)} title={k}><span className="mxIcon" data-kind={k}>{ICON[k]}</span>{c?.unread ? <i>{c.unread}</i> : null}</button>; })}
            </div>
            <div className="mxStatus">{[["OPEN", "Open"], ["NEEDS_HUMAN", "Needs a person"], ["CLOSED", "Closed"]].map(([v, l]) => <button key={v} className={status === v ? "on" : ""} onClick={() => setStatus(v)}>{l}</button>)}<button className="mxNew" onClick={() => openCompose(null)}>+ New message</button></div>
            <ul>
              {threads.map((th) => (
                <li key={th.id} className={`${sel === th.id ? "sel" : ""} ${th.unread ? "unread" : ""}`} onClick={() => setSel(th.id)}>
                  <span className="mxIcon" data-kind={th.kind}>{ICON[th.kind]}</span>
                  <div><b>{th.display_name}{th.handle ? <small> @{th.handle.replace(/^@/, "")}</small> : null}</b><p>{th.last_direction === "OUT" ? "You: " : ""}{th.preview || th.subject || ""}</p><div className="mxTags">{th.intent && th.intent !== "OTHER" && <em className={`mxIntent ${th.intent.toLowerCase()}`}>{INTENT_LABEL[th.intent] || th.intent}</em>}{th.draft && <em className="mxIntent draft">Draft ready</em>}{!th.window_open && <em className="mxIntent closed">Window closed</em>}</div></div>
                  <time>{ago(th.last_message_at)}</time>
                </li>
              ))}
              {!threads.length && <li className="mxEmpty"><b>Nothing here yet.</b><p>{counts.length ? "Change the filter to see other conversations." : "When a customer DMs, comments, texts or emails, it shows up here with the person linked to their CRM record. Connect channels under “Channels & rules”."}</p></li>}
            </ul>
          </aside>
          <main className="mxThread">
            {!t && <div className="mxPick"><b>Pick a conversation</b><p>Or connect a channel to start receiving.</p><button className="cyAiMini" onClick={() => setView("channels")}>Channels &amp; rules</button></div>}
            {t && (
              <>
                <header>
                  <span className="mxIcon big" data-kind={t.kind}>{ICON[t.kind]}</span>
                  <div><b>{t.display_name}</b><small>{t.handle ? `@${String(t.handle).replace(/^@/, "")} · ` : ""}{t.contact_email || t.contact_phone || t.subject || ""}{t.contact_id ? " · in CRM" : ""}</small></div>
                  <div className="mxHeadActions">
                    {!t.window_open && <em className="fxPill amber">24H WINDOW CLOSED{t.window_ends_at ? "" : ""}</em>}
                    {t.window_open && t.window_ends_at && <em className="fxPill green">REPLY WINDOW {Math.max(0, Math.round((new Date(String(t.window_ends_at)).getTime() - Date.now()) / 3600000))}H LEFT</em>}
                    {Boolean(t.opted_out) && <em className="fxPill">OPTED OUT</em>}
                    {t.contact_id && t.contact_email && t.kind !== "EMAIL" && <button className="cyAiMini" onClick={() => openCompose({ id: String(t.contact_id), full_name: t.display_name, email: String(t.contact_email), phone: t.contact_phone ? String(t.contact_phone) : null }, "EMAIL")}>Also email</button>}
                    {t.contact_id && t.contact_phone && t.kind !== "SMS" && <button className="cyAiMini" onClick={() => openCompose({ id: String(t.contact_id), full_name: t.display_name, email: t.contact_email ? String(t.contact_email) : null, phone: String(t.contact_phone) }, "SMS")}>Also text</button>}
                    {t.status === "OPEN" ? <button className="cyAiMini" onClick={() => void act("close")}>Close</button> : <button className="cyAiMini" onClick={() => void act("reopen")}>Reopen</button>}
                  </div>
                </header>
                <div className="mxMessages">
                  {detail!.messages.map((m) => (
                    <div key={m.id} className={`mxMsg ${m.direction.toLowerCase()} ${m.status === "FAILED" ? "failed" : ""}`}>
                      {m.kind === "COMMENT" && <small>{m.direction === "IN" ? "Public comment" : "Public reply"}</small>}
                      {m.kind === "PRIVATE_REPLY" && <small>Private reply to their comment</small>}
                      {m.kind === "STORY_REPLY" && <small>Replied to your story</small>}
                      <p>{m.body}</p>
                      <time>{new Date(m.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{m.direction === "OUT" && m.sent_by ? ` · ${m.sent_by === "cyncro-ai" ? "Cyncro (auto)" : m.sent_by === "automation" ? "automation" : m.sent_by}` : ""}{m.status === "FAILED" ? ` · not sent: ${m.error || "error"}` : ""}</time>
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>
                {Boolean(t.needs_human) && !t.draft && <div className="mxNeeds">Flagged as a complaint. Cyncro won't draft this one; a person should answer.</div>}
                {t.draft && (
                  <div className="mxDraft">
                    <small>CYNCRO DRAFT · {INTENT_LABEL[String(t.intent || "OTHER")]}</small>
                    {draftEdit === null ? <p>{t.draft}</p> : <textarea value={draftEdit} onChange={(e) => setDraftEdit(e.target.value)} rows={3} />}
                    <div>
                      <button className="coSave" disabled={busy === "send"} onClick={() => void send(draftEdit ?? String(t.draft))}>{busy === "send" ? "Sending…" : "Send this"}</button>
                      {draftEdit === null ? <button className="cyAiMini" onClick={() => setDraftEdit(String(t.draft))}>Edit</button> : <button className="cyAiMini" onClick={() => setDraftEdit(null)}>Undo edits</button>}
                      <button className="cyAiMini" onClick={() => void act("dismiss")}>Dismiss</button>
                    </div>
                  </div>
                )}
                <form className="mxCompose" onSubmit={(e) => { e.preventDefault(); void send(); }}>
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={t.window_open ? `Reply on ${t.kind === "SMS" ? "text" : t.kind.toLowerCase()}…` : "Reply window closed. You can answer once they message again."} disabled={!t.window_open} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(); }} />
                  <div>
                    {lastInbound?.kind === "COMMENT" && lastInbound.external_ref && (t.kind === "INSTAGRAM" || t.kind === "FACEBOOK") && <>
                      <button type="button" className="cyAiMini" disabled={!text.trim()} onClick={() => void send(text, { replyToCommentId: lastInbound.external_ref })}>Reply publicly</button>
                      <button type="button" className="cyAiMini" disabled={!text.trim()} onClick={() => void send(text, { replyToCommentId: lastInbound.external_ref, privateReply: true })}>Send as private DM</button>
                    </>}
                    <button type="submit" className="coSave" disabled={busy === "send" || !text.trim() || !t.window_open}>{busy === "send" ? "Sending…" : "Send"}</button>
                  </div>
                </form>
              </>
            )}
          </main>
        </section>
      )}
      {compose && (
        <div className="mxModalBack" onClick={() => setCompose(null)}>
          <div className="mxModal" onClick={(e) => e.stopPropagation()}>
            <small>NEW MESSAGE</small>
            <h3>{compose.contact ? compose.contact.full_name : "Who is it for?"}</h3>
            {!compose.contact && (
              <div className="mxSearch">
                <input autoFocus value={compose.q} onChange={(e) => void searchContacts(e.target.value)} placeholder="Search contacts by name, email or phone" />
                {compose.hits.length > 0 && <ul>{compose.hits.map((h) => <li key={h.id}><button onClick={() => setCompose({ ...compose, contact: h, kind: h.email ? compose.kind : "SMS", hits: [] })}><b>{h.full_name}</b><span>{[h.email, h.phone].filter(Boolean).join(" · ") || "no email or phone"}</span></button></li>)}</ul>}
                {compose.q.trim().length >= 2 && !compose.hits.length && <p>No contact matches. Add them in the CRM first.</p>}
              </div>
            )}
            {compose.contact && (
              <>
                <div className="mxKindPick">
                  <button className={compose.kind === "EMAIL" ? "on" : ""} disabled={!compose.contact.email} onClick={() => setCompose({ ...compose, kind: "EMAIL" })}>✉ Email{compose.contact.email ? "" : " (none)"}</button>
                  <button className={compose.kind === "SMS" ? "on" : ""} disabled={!compose.contact.phone} onClick={() => setCompose({ ...compose, kind: "SMS" })}>▭ Text{compose.contact.phone ? "" : " (none)"}</button>
                  <span>Instagram, Facebook and WhatsApp conversations start when the customer messages you.</span>
                </div>
                {compose.kind === "EMAIL" && <input value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} placeholder="Subject" />}
                <textarea rows={4} value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} placeholder={compose.kind === "EMAIL" ? "Write the email…" : "Write the text…"} />
                <div className="mxModalActions">
                  <button className="cyAiMini" onClick={() => setCompose({ ...compose, contact: null })}>Change person</button>
                  <button className="cyAiMini" onClick={() => setCompose(null)}>Cancel</button>
                  <button className="coSave" disabled={busy === "start" || !compose.body.trim()} onClick={() => void startNew()}>{busy === "start" ? "Sending…" : compose.kind === "EMAIL" ? "Send email" : "Send text"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
