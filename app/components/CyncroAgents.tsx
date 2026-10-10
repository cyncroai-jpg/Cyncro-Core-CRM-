"use client";
import { useEffect, useState } from "react";

type Agent = { id: string; name: string; role: string; instructions: string; tools: string[]; schedule: string; run_hour: number; auto_act: number; daily_cap: number; run_as: string; active: number; template_key: string | null; last_run_at: string | null };
type Template = { key: string; name: string; blurb: string; role: string; instructions: string; tools: string[]; schedule: string; runHour: number; autoAct: boolean; dailyCap: number };
type ToolInfo = { name: string; kind: string; risk: string; description: string };
type Run = { id: string; agent_id: string; trigger: string; reply: string | null; toolCalls: string[]; acted: { summary: string; ok: boolean }[]; pending: { summary: string }[]; status: string; error: string | null; started_at: string };
type Data = { agents: Agent[]; templates: Template[]; tools: ToolInfo[]; team: { email: string; display_name: string }[]; canManage: boolean; configured: boolean; runs: Run[] };
type Draft = { id?: string; name: string; role: string; instructions: string; tools: string[]; schedule: string; runHour: number; autoAct: boolean; dailyCap: number; runAs: string };

/** Agent Team → Cyncro Agents: AI teammates the company defines, with their own job, tools, schedule and limits. */
export function CyncroAgents({ onFlash }: { onFlash: (m: string) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState("");
  const [ask, setAsk] = useState<Record<string, string>>({});
  const load = async () => { const r = await fetch("/api/agents/custom", { cache: "no-store" }); if (r.ok) setD(await r.json()); };
  useEffect(() => { void load(); }, []);
  if (!d) return null;
  const call = async (method: string, body?: unknown, qs = "") => { const r = await fetch(`/api/agents/custom${qs}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) { onFlash(j.error || "That didn't work"); return null; } return j; };
  const fromTemplate = (t: Template) => setDraft({ name: t.name, role: t.role, instructions: t.instructions, tools: t.tools, schedule: t.schedule, runHour: t.runHour, autoAct: t.autoAct, dailyCap: t.dailyCap, runAs: d.team[0]?.email || "" });
  const edit = (a: Agent) => setDraft({ id: a.id, name: a.name, role: a.role, instructions: a.instructions, tools: a.tools, schedule: a.schedule, runHour: a.run_hour, autoAct: Boolean(a.auto_act), dailyCap: a.daily_cap, runAs: a.run_as });
  const save = async () => {
    if (!draft) return; setBusy("save");
    const j = draft.id ? await call("PATCH", { id: draft.id, ...draft }) : await call("POST", draft);
    setBusy(""); if (j) { setDraft(null); await load(); onFlash(draft.id ? "Agent updated" : `${draft.name} is on the team`); }
  };
  const run = async (a: Agent) => { setBusy(a.id); const j = await call("POST", { action: "run", id: a.id, message: ask[a.id] || undefined }); setBusy(""); if (j) { setAsk({ ...ask, [a.id]: "" }); await load(); setOpen(j.runId); onFlash(`${a.name}: ${j.acted.length} done, ${j.pending.length} waiting for approval`); } };
  const toggle = async (a: Agent) => { const j = await call("PATCH", { id: a.id, active: !a.active }); if (j) await load(); };
  const remove = async (a: Agent) => { if (!window.confirm(`Remove ${a.name}? Its run history stays.`)) return; const j = await call("DELETE", undefined, `?id=${a.id}`); if (j) { await load(); onFlash("Agent removed"); } };
  const name = (id: string) => d.agents.find((a) => a.id === id)?.name || "Agent";
  const sched = (a: Agent) => a.schedule === "HOURLY" ? "every hour" : a.schedule === "DAILY" ? `daily at ${a.run_hour}:00` : "when asked";
  return (
    <section className="crmPanel cyAgents">
      <div className="crmPanelHead"><div><small>CYNCRO AGENTS</small><h2>{d.agents.length ? `${d.agents.length} agent${d.agents.length === 1 ? "" : "s"} on the team` : "Hire your first AI teammate"}</h2><p>Each agent has a job, the tools it may use, a schedule and a daily limit. It reads only this company's data; anything it may not do on its own waits in the approver's drawer.</p></div>{d.canManage && <button className="coSave" onClick={() => setDraft({ name: "", role: "", instructions: "", tools: ["workspace_summary", "search_contacts", "get_contact", "create_task"], schedule: "MANUAL", runHour: 8, autoAct: false, dailyCap: 10, runAs: d.team[0]?.email || "" })}>＋ Blank agent</button>}</div>
      {!d.configured && <div className="billNote">Cyncro AI isn't switched on for this deployment, so agents can be set up but won't run until the AI key is on the server.</div>}
      {d.canManage && !draft && (
        <div className="cyTemplates">{d.templates.map((t) => <button key={t.key} onClick={() => fromTemplate(t)}><b>{t.name}</b><span>{t.blurb}</span><small>{t.schedule === "HOURLY" ? "hourly" : t.schedule === "DAILY" ? `daily ${t.runHour}:00` : "manual"} · {t.tools.length} tools · {t.autoAct ? "acts on its own" : "proposes"}</small></button>)}</div>
      )}
      {draft && (
        <div className="cyDraft">
          <div className="cyDraftGrid">
            <label>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Lead qualifier" /></label>
            <label>Role<input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} placeholder="e.g. Sales development rep" /></label>
            <label className="wide">Standing instructions<textarea rows={6} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} placeholder="What it does each run, in plain words. Be specific about what to look for and what to do." /></label>
            <label>Runs<select value={draft.schedule} onChange={(e) => setDraft({ ...draft, schedule: e.target.value })}><option value="MANUAL">Only when asked</option><option value="HOURLY">Every hour</option><option value="DAILY">Once a day</option></select></label>
            <label>At hour (daily)<input type="number" min={0} max={23} value={draft.runHour} onChange={(e) => setDraft({ ...draft, runHour: Number(e.target.value) })} disabled={draft.schedule !== "DAILY"} /></label>
            <label>Max runs a day<input type="number" min={1} max={500} value={draft.dailyCap} onChange={(e) => setDraft({ ...draft, dailyCap: Number(e.target.value) })} /></label>
            <label>Acts as<select value={draft.runAs} onChange={(e) => setDraft({ ...draft, runAs: e.target.value })}>{d.team.map((m) => <option key={m.email} value={m.email}>{m.display_name}</option>)}</select></label>
            <label className="coToggle wide"><input type="checkbox" checked={draft.autoAct} onChange={(e) => setDraft({ ...draft, autoAct: e.target.checked })} /><span><b>May act on its own for low-risk writes</b><small>Tags, notes, tasks, new contacts, deals, bookings, jobs. Also needs "Let Cyncro act without asking" on in Company profile. Everything else is proposed to the person it acts as.</small></span></label>
            <div className="wide cyTools"><small>TOOLS IT MAY USE</small><div>{d.tools.map((t) => <label key={t.name} className={draft.tools.includes(t.name) ? "on" : ""} title={t.description}><input type="checkbox" checked={draft.tools.includes(t.name)} onChange={(e) => setDraft({ ...draft, tools: e.target.checked ? [...draft.tools, t.name] : draft.tools.filter((x) => x !== t.name) })} /><span>{t.name.replace(/_/g, " ")}</span><em className={`fxPill ${t.kind === "read" ? "cool" : t.risk === "low" ? "amber" : "red"}`}>{t.kind === "read" ? "READ" : t.risk === "low" ? "LOW RISK" : "APPROVAL"}</em></label>)}</div></div>
          </div>
          <div className="cmAddBtnRow"><button className="coSave" disabled={busy === "save" || !draft.name || !draft.instructions || !draft.tools.length} onClick={() => void save()}>{busy === "save" ? "Saving…" : draft.id ? "Save changes" : "Add to the team"}</button><button className="cyAiMini" onClick={() => setDraft(null)}>Cancel</button></div>
        </div>
      )}
      <div className="cyAgentList">
        {d.agents.map((a) => { const last = d.runs.find((r) => r.agent_id === a.id); return (
          <article key={a.id} className={`cyAgent ${a.active ? "" : "off"}`}>
            <header><div><b>{a.name}</b><small>{a.role} · {sched(a)} · cap {a.daily_cap}/day · as {d.team.find((m) => m.email === a.run_as)?.display_name || a.run_as}</small></div>{d.canManage && <button className={`fxLendSwitch ${a.active ? "on" : ""}`} aria-label={a.active ? "Pause" : "Resume"} onClick={() => void toggle(a)}><i /></button>}</header>
            <p>{a.instructions.slice(0, 220)}{a.instructions.length > 220 ? "…" : ""}</p>
            <div className="cyAgentTools">{a.tools.map((t) => <span key={t}>{t.replace(/_/g, " ")}</span>)}</div>
            {last && <div className={`cyLast ${last.status.toLowerCase()}`}><small>LAST RUN · {new Date(last.started_at).toLocaleString()} · {last.trigger}</small><span>{last.status === "FAILED" ? last.error : last.reply?.slice(0, 160)}</span></div>}
            {d.canManage && <footer><input value={ask[a.id] || ""} onChange={(e) => setAsk({ ...ask, [a.id]: e.target.value })} placeholder="Optional: a specific ask for this run" /><button className="coSave" disabled={busy === a.id || !d.configured} onClick={() => void run(a)}>{busy === a.id ? "Running…" : "Run now"}</button><button className="cyAiMini" onClick={() => edit(a)}>Edit</button><button className="dangerText" onClick={() => void remove(a)}>Remove</button></footer>}
          </article>); })}
      </div>
      {d.runs.length > 0 && (
        <div className="bgRuns">
          <small>RECENT RUNS</small>
          {d.runs.slice(0, 15).map((r) => <div key={r.id} className="bgRun"><button onClick={() => setOpen(open === r.id ? "" : r.id)}><b>{name(r.agent_id)}</b><span>{r.status === "FAILED" ? `Failed: ${r.error}` : r.status === "CAPPED" ? "Daily cap reached" : `${r.acted.length} done · ${r.pending.length} waiting · ${r.toolCalls.length} tool calls`}</span><small>{r.trigger} · {new Date(r.started_at).toLocaleString()}</small></button>
            {open === r.id && <div className="cyRunDetail">{r.reply && <p>{r.reply}</p>}{r.acted.length > 0 && <ul>{r.acted.map((a, i) => <li key={i}>{a.ok ? "✓" : "✗"} {a.summary}</li>)}</ul>}{r.pending.length > 0 && <ul className="pend">{r.pending.map((p, i) => <li key={i}>⏳ {p.summary}</li>)}</ul>}</div>}
          </div>)}
        </div>
      )}
    </section>
  );
}
