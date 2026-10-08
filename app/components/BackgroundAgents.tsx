"use client";
import { useEffect, useState } from "react";

type Agent = { kind: string; name: string; what: string; fields: { key: string; label: string; min: number; max: number }[]; enabled: boolean; settings: Record<string, number>; lastRunAt: string | null; lastRun: { summary: string; actions: number; started_at: string } | null };
type Run = { id: string; kind: string; trigger: string; started_at: string; actions: number; summary: string; details: string[] };

/** Agent Team → background agents: switch on, tune, run now, and read what each one did. */
export function BackgroundAgents({ onFlash }: { onFlash: (m: string) => void }) {
  const [d, setD] = useState<{ agents: Agent[]; runs: Run[]; canManage: boolean } | null>(null);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<string>("");
  const load = async () => { const r = await fetch("/api/agents/background", { cache: "no-store" }); if (r.ok) setD(await r.json()); };
  useEffect(() => { void load(); }, []);
  if (!d) return null;
  const patch = async (kind: string, body: Record<string, unknown>) => { const r = await fetch("/api/agents/background", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ...body }) }); const j = await r.json().catch(() => ({})); if (!r.ok) return onFlash(j.error || "Could not save"); await load(); };
  const run = async (a: Agent) => { setBusy(a.kind); const r = await fetch("/api/agents/background", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: a.kind }) }); const j = await r.json().catch(() => ({})); setBusy(""); if (!r.ok) return onFlash(j.error || "Run failed"); await load(); onFlash(`${a.name}: ${j.summary}`); };
  const name = (k: string) => d.agents.find((a) => a.kind === k)?.name || k;
  return (
    <section className="crmPanel bgAgents">
      <div className="crmPanelHead"><div><small>BACKGROUND AGENTS</small><h2>Work that happens while you're not looking</h2><p>Each agent runs every hour on its own, inside a daily cap, and leaves a report here. Everything it does is a normal task, booking or email you can see and undo.</p></div></div>
      <div className="bgGrid">
        {d.agents.map((a) => (
          <article key={a.kind} className={`bgAgent ${a.enabled ? "on" : ""}`}>
            <header><div><b>{a.name}</b><small>{a.enabled ? `On · last ran ${a.lastRunAt ? new Date(a.lastRunAt).toLocaleString() : "not yet"}` : "Off"}</small></div>{d.canManage && <button className={`fxLendSwitch ${a.enabled ? "on" : ""}`} aria-label={`${a.enabled ? "Turn off" : "Turn on"} ${a.name}`} onClick={() => void patch(a.kind, { enabled: !a.enabled })}><i /></button>}</header>
            <p>{a.what}</p>
            <div className="bgFields">{a.fields.map((f) => <label key={f.key}>{f.label}<input type="number" min={f.min} max={f.max} defaultValue={a.settings[f.key]} disabled={!d.canManage} onBlur={(e) => Number(e.target.value) !== a.settings[f.key] && void patch(a.kind, { settings: { [f.key]: Number(e.target.value) } })} /></label>)}</div>
            <footer>{a.lastRun ? <span className="bgLast"><em>{a.lastRun.actions}</em>{a.lastRun.summary}</span> : <span className="bgLast dim">No runs yet</span>}{d.canManage && <button className="cyAiMini" disabled={busy === a.kind} onClick={() => void run(a)}>{busy === a.kind ? "Running…" : "Run now"}</button>}</footer>
          </article>
        ))}
      </div>
      {d.runs.length > 0 && (
        <div className="bgRuns">
          <small>RECENT RUNS</small>
          {d.runs.slice(0, 12).map((r) => <div key={r.id} className="bgRun"><button onClick={() => setOpen(open === r.id ? "" : r.id)}><b>{name(r.kind)}</b><span>{r.summary}</span><small>{r.trigger} · {new Date(r.started_at).toLocaleString()}</small></button>{open === r.id && r.details.length > 0 && <ul>{r.details.map((x, i) => <li key={i}>{x}</li>)}</ul>}</div>)}
        </div>
      )}
    </section>
  );
}
