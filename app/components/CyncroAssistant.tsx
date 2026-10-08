"use client";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; text: string; at?: string };
type Pending = { id: string; tool: string; summary: string; created_at: string };
type Usage = { calls: number; cap: number; month?: string };

/**
 * Cyncro AI: floating button + drawer on every screen. Talks to
 * /api/ai/assistant, which answers from this company's real records and
 * queues any write as a pending action the teammate must approve here.
 */
export function CyncroAssistant({ screen, open, onOpenChange, onNavigate }: { screen: string; open?: boolean; onOpenChange?: (o: boolean) => void; onNavigate?: (target: string) => void }) {
  const [isOpen, setIsOpen] = useState(Boolean(open));
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [configured, setConfigured] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [loaded, setLoaded] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open !== undefined) setIsOpen(open); }, [open]);
  const setOpen = (o: boolean) => { setIsOpen(o); onOpenChange?.(o); };
  const load = async () => {
    const r = await fetch("/api/ai/assistant"); if (!r.ok) return;
    const d = await r.json() as { configured: boolean; history: { role: "user" | "assistant"; content: string; created_at: string }[]; pending: Pending[]; usage: Usage };
    setConfigured(d.configured); setPending(d.pending); setUsage(d.usage); setLoaded(true);
    setMsgs(d.history.map((h) => ({ role: h.role, text: h.content, at: h.created_at })));
  };
  useEffect(() => { if (isOpen && !loaded) void load(); }, [isOpen, loaded]);
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, pending, busy]);
  const send = async (text: string) => {
    const t = text.trim(); if (!t || busy) return;
    setQ(""); setMsgs((m) => [...m, { role: "user", text: t }]); setBusy("ask");
    const r = await fetch("/api/ai/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: t, screen }) });
    const d = await r.json().catch(() => ({})) as { reply?: string; pending?: Pending[]; acted?: { summary: string; ok: boolean }[]; usage?: Usage; error?: string };
    setBusy("");
    if (!r.ok) { setMsgs((m) => [...m, { role: "assistant", text: d.error || "Something went wrong." }]); return; }
    setMsgs((m) => [...m, { role: "assistant", text: d.reply || "" }, ...(d.acted || []).map((a) => ({ role: "assistant" as const, text: `${a.ok ? "✓ Done" : "✗ Couldn't do"}: ${a.summary}` }))]); if (d.pending?.length) setPending((p) => [...p, ...d.pending!]); if (d.usage) setUsage(d.usage);
  };
  const decide = async (p: Pending, approve: boolean) => {
    setBusy(p.id);
    const r = await fetch(`/api/ai/assistant?action=${approve ? "approve" : "dismiss"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id }) });
    const d = await r.json().catch(() => ({})) as { done?: boolean; result?: { error?: string } & Record<string, unknown>; error?: string };
    setBusy(""); setPending((list) => list.filter((x) => x.id !== p.id));
    if (!approve) { setMsgs((m) => [...m, { role: "assistant", text: `Skipped: ${p.summary}` }]); return; }
    setMsgs((m) => [...m, { role: "assistant", text: d.done ? `Done: ${p.summary}` : `Couldn't do that: ${d.result?.error || d.error || "unknown error"}` }]);
  };
  const clear = async () => { if (!window.confirm("Clear your conversation with Cyncro AI?")) return; await fetch("/api/ai/assistant", { method: "DELETE" }); setMsgs([]); setPending([]); };
  const starters = ["What should I do first today?", "Who's booked today?", "Which deals are stale?", "Overdue tasks for me"];
  return (
    <>
      {!isOpen && <button className="cyAiFab" onClick={() => setOpen(true)} title="Ask Cyncro AI"><span>✦</span><b>Ask Cyncro</b></button>}
      {isOpen && (
        <div className="aiDrawer cyAi">
          <div className="aiDrawerHead">
            <div><span>✦</span><div><small>CYNCRO AI</small><b>Your assistant{usage ? ` · ${usage.calls}/${usage.cap} this month` : ""}</b></div></div>
            <div className="cyAiHeadActions">{msgs.length > 0 && <button className="cyAiMini" onClick={() => void clear()} title="Clear memory">Clear</button>}<button onClick={() => setOpen(false)}>×</button></div>
          </div>
          {!configured && <div className="cyAiNotice">Cyncro AI isn't switched on for this deployment yet. The owner needs to add the AI key on the server. Everything else in the app works without it.</div>}
          <div className="aiConversation" ref={scroller}>
            {!msgs.length && <div className="aiAnswer"><span>✦</span><p>I answer from {"this company's"} real contacts, deals, bookings, tasks, jobs and invoices, and I can create tasks, notes, deals and bookings once you approve them. What do you need?</p></div>}
            {msgs.map((m, i) => m.role === "user" ? <div key={i} className="aiPrompt">{m.text}</div> : <div key={i} className="aiAnswer"><span>✦</span><p>{m.text}</p></div>)}
            {pending.map((p) => (
              <div key={p.id} className="cyAiAction">
                <small>NEEDS YOUR OK</small><b>{p.summary}</b>
                <div><button className="cyAiApprove" disabled={busy === p.id} onClick={() => void decide(p, true)}>{busy === p.id ? "Working…" : "Approve"}</button><button className="cyAiMini" disabled={busy === p.id} onClick={() => void decide(p, false)}>Skip</button></div>
              </div>
            ))}
            {busy === "ask" && <div className="aiAnswer"><span>✦</span><p style={{ color: "#8f858b" }}>Checking your workspace…</p></div>}
          </div>
          {!msgs.length && <div className="aiSuggestions">{starters.map((s) => <button key={s} onClick={() => void send(s)}>{s}</button>)}</div>}
          <div className="aiComposer">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask, or tell me what to do…" onKeyDown={(e) => { if (e.key === "Enter") void send(q); }} disabled={busy === "ask"} />
            <button disabled={!q.trim() || busy === "ask"} onClick={() => void send(q)}>↑</button>
          </div>
          <small className="aiPermission">Answers come from your company's live data. Changes wait for your approval and are logged under your name.{onNavigate ? "" : ""}</small>
        </div>
      )}
    </>
  );
}
