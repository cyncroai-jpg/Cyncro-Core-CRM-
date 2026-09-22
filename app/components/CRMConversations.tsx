"use client";
import { useEffect, useMemo, useState } from "react";

type Thread = { contact_id: string; full_name: string; email: string | null; phone: string | null; assigned_rep: string | null; lifecycle: string; company_name: string | null; message_count: number; last_type: string | null; last_title: string | null; last_at: string | null; upcoming_bookings: number };
type Channels = { email: { connected: boolean; transport: string; from: string }; sms: { connected: boolean }; social: { connected: boolean } };
type Activity = { id: string; activity_type: string; title: string; details: string | null; status: string; created_by: string | null; created_at: string; due_at: string | null };
type Kind = "EMAIL" | "SMS" | "CALL" | "NOTE" | "MEETING";

const ago = (iso: string | null) => { if (!iso) return ""; const m = Math.round((Date.now() - new Date(iso).valueOf()) / 60000); if (m < 1) return "now"; if (m < 60) return `${m}m`; const h = Math.round(m / 60); if (h < 48) return `${h}h`; return `${Math.round(h / 24)}d`; };
const when = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const icon = (t: string | null) => (t === "EMAIL" ? "✉" : t === "SMS" ? "▭" : t === "CALL" ? "☏" : t === "MEETING" ? "◫" : t === "TASK" ? "☐" : "≡");
const initials = (n: string) => n.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

export function CRMConversations({ onFlash, onOpenContact }: { onFlash: (m: string) => void; onOpenContact?: (contactId: string) => void }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [channels, setChannels] = useState<Channels | null>(null);
  const [me, setMe] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"ALL" | "MINE" | "ACTIVE" | "QUIET">("ALL");
  const [selectedId, setSelectedId] = useState("");
  const [timeline, setTimeline] = useState<Activity[]>([]);
  const [kind, setKind] = useState<Kind>("NOTE");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = () => fetch("/api/crm/conversations").then((r) => r.json()).then((d: { threads?: Thread[]; channels?: Channels; me?: string }) => { setThreads(d.threads || []); setChannels(d.channels || null); setMe(d.me || ""); setLoaded(true); });
  const loadTimeline = (id: string) => fetch(`/api/crm/activities?contactId=${id}&limit=100`).then((r) => r.json()).then((d: { activities?: Activity[] }) => setTimeline(d.activities || []));
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (selectedId) void loadTimeline(selectedId); else setTimeline([]); }, [selectedId]);
  useEffect(() => { if (!selectedId && threads.length) setSelectedId(threads[0].contact_id); }, [threads, selectedId]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return threads.filter((t) => {
      if (filter === "MINE" && (t.assigned_rep || "").toLowerCase() !== me.toLowerCase()) return false;
      if (filter === "ACTIVE" && !t.message_count) return false;
      if (filter === "QUIET" && t.last_at && Date.now() - new Date(t.last_at).valueOf() < 7 * 86_400_000) return false;
      return !needle || [t.full_name, t.email, t.phone, t.company_name].join(" ").toLowerCase().includes(needle);
    });
  }, [threads, q, filter, me]);
  const selected = threads.find((t) => t.contact_id === selectedId) || null;
  const canEmail = Boolean(channels?.email.connected && selected?.email);

  const send = async () => {
    if (!selected || !body.trim()) return;
    if (kind === "EMAIL" && !canEmail) { onFlash(selected.email ? "Connect an email sender first" : "This contact has no email"); return; }
    setBusy(true);
    const r = await fetch("/api/crm/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: selected.contact_id, kind, subject, body }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { onFlash(b.error || "Could not save"); return; }
    onFlash(kind === "EMAIL" ? `Email sent to ${selected.email}` : kind === "NOTE" ? "Note saved" : `${kind === "CALL" ? "Call" : kind === "SMS" ? "Text" : "Meeting"} logged`);
    setBody(""); setSubject(""); await Promise.all([load(), loadTimeline(selected.contact_id)]);
  };
  const kpis = useMemo(() => ({
    contacts: threads.length, active: threads.filter((t) => t.message_count > 0).length,
    week: threads.filter((t) => t.last_at && Date.now() - new Date(t.last_at).valueOf() < 7 * 86_400_000).length,
    quiet: threads.filter((t) => !t.last_at || Date.now() - new Date(t.last_at).valueOf() >= 14 * 86_400_000).length,
    booked: threads.reduce((s, t) => s + Number(t.upcoming_bookings || 0), 0),
  }), [threads]);

  return (
    <div className="cvHub">
      <div className="dxCCTop">
        <div className="dxCCDate"><b>Conversations</b><small>{kpis.active} contacts with a thread · {kpis.week} touched this week · email {channels?.email.connected ? `sends via ${channels.email.transport}` : "sender not connected"}</small></div>
        <div className="fxInvSearch"><input placeholder="Search people, companies, phone…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search conversations" /></div>
        <div className="fxLendChips">
          {([["ALL", "All"], ["MINE", "Mine"], ["ACTIVE", "With messages"], ["QUIET", "Quiet 7d+"]] as const).map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
      </div>

      <aside className="fxCCPanel cvList">
        <div className="fxCCHead"><div><b>Threads</b><small>{list.length} shown · newest activity first</small></div></div>
        <div className="cvThreads">
          {list.map((t) => (
            <button key={t.contact_id} className={`cvThread ${t.contact_id === selectedId ? "sel" : ""}`} onClick={() => setSelectedId(t.contact_id)}>
              <i>{initials(t.full_name)}</i>
              <span><b>{t.full_name}</b><small>{t.last_title ? `${icon(t.last_type)} ${t.last_title}` : t.company_name || t.email || "No messages yet"}</small></span>
              <em>{ago(t.last_at)}{t.upcoming_bookings ? <b title="Upcoming booking">◫</b> : null}</em>
            </button>
          ))}
          {loaded && !list.length && <div className="fxCCEmpty">{threads.length ? "No one matches that filter." : "No contacts yet. Add or import contacts and their conversations collect here."}</div>}
        </div>
      </aside>

      <section className={`fxCCPanel ${selected ? "fxCCHero" : ""} cvPane`}>
        {selected ? (
          <>
            <div className="fxCCHead">
              <div><b>{selected.full_name}</b><small>{[selected.company_name, selected.email, selected.phone].filter(Boolean).join(" · ") || "No contact details"}</small></div>
              <div className="cvPaneActions">
                {selected.phone && <a href={`tel:${selected.phone}`}>Call</a>}
                {selected.phone && <a href={`sms:${selected.phone}`}>Text</a>}
                {onOpenContact && <button className="fxCCMini" onClick={() => onOpenContact(selected.contact_id)}>Open contact</button>}
              </div>
            </div>
            <div className="cvTimeline">
              {timeline.map((a) => (
                <article key={a.id} className={`cvMsg ${a.activity_type.toLowerCase()} ${a.created_by === me ? "me" : ""}`}>
                  <i>{icon(a.activity_type)}</i>
                  <div><b>{a.title}</b>{a.details && a.details !== a.title && <p>{a.details}</p>}<small>{a.activity_type.toLowerCase()} · {a.created_by || "team"} · {when(a.created_at)}{a.due_at ? ` · due ${when(a.due_at)}` : ""}</small></div>
                </article>
              ))}
              {!timeline.length && <div className="fxCCEmpty">No touches logged with {selected.full_name} yet. Send an email or log a call below.</div>}
            </div>
            <div className="cvCompose">
              <div className="cvKinds">
                {(["EMAIL", "CALL", "SMS", "MEETING", "NOTE"] as Kind[]).map((k) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k === "EMAIL" ? "Send email" : k === "CALL" ? "Log call" : k === "SMS" ? "Log text" : k === "MEETING" ? "Log meeting" : "Note"}</button>)}
              </div>
              {kind === "EMAIL" && <input className="cvSubject" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />}
              <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={kind === "EMAIL" ? (canEmail ? `Email ${selected.email} from ${channels?.email.from}` : selected.email ? "Connect an email sender to send from here" : "This contact has no email address") : kind === "NOTE" ? "Internal note, only your team sees it" : "What was said, what's next…"} />
              <div className="fxInvSave">
                {kind === "EMAIL" && !canEmail && <small className="cvWarn">{selected.email ? "Email sending needs a Resend key or a connected Google account." : "Add an email to this contact first."}</small>}
                <button className="fxCCPrimary" disabled={busy || !body.trim() || (kind === "EMAIL" && !canEmail)} onClick={() => void send()}>{busy ? "Working…" : kind === "EMAIL" ? "Send email" : "Save"}</button>
              </div>
            </div>
          </>
        ) : (
          <div className="fxCCEmpty">{loaded ? "Pick a person to see every call, text, email and note in one place." : "Loading…"}</div>
        )}
      </section>

      <aside className="cvSide">
        <section className="fxCCPanel">
          <div className="fxCCHead"><div><b>Channels</b><small>what is really connected</small></div></div>
          <ul className="cvChannels">
            <li className={channels?.email.connected ? "on" : ""}><i /><b>Email</b><span>{channels?.email.connected ? `sends via ${channels.email.transport} as ${channels.email.from}` : "not connected · add a Resend key or connect Google in Calendar"}</span></li>
            <li><i /><b>SMS</b><span>logging only · no texting provider connected</span></li>
            <li><i /><b>Instagram / Facebook</b><span>not connected</span></li>
            <li className="on"><i /><b>Calls</b><span>tap Call to dial from your phone, then log it here</span></li>
          </ul>
        </section>
        {selected && (
          <section className="fxCCPanel">
            <div className="fxCCHead"><div><b>About</b><small>{selected.lifecycle.toLowerCase()} · owner {selected.assigned_rep || "unassigned"}</small></div></div>
            <div className="dxWOFacts">
              <div><span>Touches logged</span><b>{selected.message_count}</b></div>
              <div><span>Last activity</span><b>{selected.last_at ? when(selected.last_at) : "never"}</b></div>
              <div><span>Upcoming bookings</span><b>{selected.upcoming_bookings}</b></div>
            </div>
          </section>
        )}
      </aside>

      <div className="fxCCKpis fxInvKpis cvKpis">
        <article><i>◎</i><div><small>CONTACTS</small><b>{kpis.contacts}</b><span>{kpis.active} with a thread</span></div></article>
        <article><i>✓</i><div><small>TOUCHED THIS WEEK</small><b>{kpis.week}</b><span>calls, texts, emails, notes</span></div></article>
        <article><i>!</i><div><small>GONE QUIET</small><b>{kpis.quiet}</b><span>14+ days silent</span></div></article>
        <article><i>◫</i><div><small>UPCOMING BOOKINGS</small><b>{kpis.booked}</b><span>across all threads</span></div></article>
        <article><i>✉</i><div><small>EMAIL</small><b>{channels?.email.connected ? "On" : "Off"}</b><span>{channels?.email.connected ? channels.email.transport : "sender not connected"}</span></div></article>
      </div>
    </div>
  );
}
