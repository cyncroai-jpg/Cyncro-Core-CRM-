"use client";
import { useEffect, useMemo, useState } from "react";

type Entry = { id: string; job_id: string; tech_id: string | null; clock_in_at: string; clock_out_at: string | null; tech_name: string | null; service_type: string | null; customer_name: string | null; address: string | null };
type Tech = { id: string; name: string; hourly_rate_cents?: number };
type JobRow = { id: string; customer_name: string | null; service_type: string; scheduled_at: string; status: string; assigned_tech_id: string | null };

const hm = (min: number) => { const m = Math.max(0, Math.round(min)); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`; };
const hms = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const minutes = (e: Entry, now: number) => ((e.clock_out_at ? new Date(e.clock_out_at).valueOf() : now) - new Date(e.clock_in_at).valueOf()) / 60000;

export function DispatchTimeClock({ onFlash, onOpenJob, refreshKey = 0 }: { onFlash: (m: string) => void; onOpenJob: (jobId: string) => void; refreshKey?: number }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [techId, setTechId] = useState("");
  const [jobId, setJobId] = useState("");
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const from = new Date(); from.setDate(from.getDate() - 7); from.setHours(0, 0, 0, 0);
    const [e, t, j] = await Promise.all([
      fetch(`/api/dispatch/jobs/time?from=${from.toISOString()}&to=${new Date(Date.now() + 86_400_000).toISOString()}`).then((r) => r.json()).catch(() => ({})),
      fetch("/api/dispatch/technicians").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dispatch/jobs").then((r) => r.json()).catch(() => ({})),
    ]);
    setEntries((e.entries || []) as Entry[]); setTechs((t.technicians || []) as Tech[]); setJobs((j.jobs || []) as JobRow[]); setLoaded(true);
  };
  useEffect(() => { void load(); }, [refreshKey]);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => { if (!techId && techs.length) setTechId(techs[0].id); }, [techs, techId]);

  const open = useMemo(() => entries.filter((e) => !e.clock_out_at), [entries]);
  const todayKey = dayKey(new Date());
  const today = useMemo(() => entries.filter((e) => dayKey(new Date(e.clock_in_at)) === todayKey), [entries, todayKey]);
  const perTech = useMemo(() => techs.map((t) => {
    const mine = today.filter((e) => e.tech_id === t.id);
    const week = entries.filter((e) => e.tech_id === t.id);
    return { ...t, todayMin: mine.reduce((s, e) => s + minutes(e, now), 0), weekMin: week.reduce((s, e) => s + minutes(e, now), 0), onClock: open.find((e) => e.tech_id === t.id) || null };
  }), [techs, today, entries, open, now]);
  const maxToday = Math.max(60, ...perTech.map((t) => t.todayMin));
  const techJobs = useMemo(() => {
    const active = jobs.filter((j) => !["COMPLETE", "INVOICED", "CANCELLED"].includes(j.status));
    const mine = active.filter((j) => j.assigned_tech_id === techId);
    const rest = active.filter((j) => j.assigned_tech_id !== techId);
    return [...mine.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)), ...rest.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))];
  }, [jobs, techId]);
  useEffect(() => { if (techJobs.length && !techJobs.some((j) => j.id === jobId)) setJobId(techJobs[0].id); }, [techJobs, jobId]);
  const myOpen = open.find((e) => e.tech_id === techId) || null;

  const toggle = async (job: string, tech: string | null) => {
    setBusy(job + (tech || ""));
    const r = await fetch("/api/dispatch/jobs/time", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job, techId: tech || undefined }) });
    const b = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { onFlash(b.error || "Could not update the clock"); return; }
    onFlash(b.clockedIn ? "Clocked in" : "Clocked out"); await load();
  };
  const exportCsv = () => {
    const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = entries.map((e) => [e.tech_name, e.customer_name, e.service_type, e.clock_in_at, e.clock_out_at || "", (minutes(e, now) / 60).toFixed(2)].map(esc).join(","));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([["Technician,Customer,Job,Clock in,Clock out,Hours", ...lines].join("\n")], { type: "text/csv" })); a.download = `timesheet-${todayKey}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const kpis = { onClock: open.length, todayMin: today.reduce((s, e) => s + minutes(e, now), 0), weekMin: entries.reduce((s, e) => s + minutes(e, now), 0), entries: entries.length };

  return (
    <div className="dxClk">
      <div className="dxCCTop">
        <div className="dxCCDate"><b>Time clock</b><small>{open.length} on the clock right now · {hm(kpis.todayMin)} logged today · every punch lands on the job's work order</small></div>
        <div className="fxCCActions"><button onClick={exportCsv} disabled={!entries.length}>Export timesheet</button></div>
      </div>

      <section className="fxCCPanel fxCCHero dxClkPunch">
        <div className="fxCCHead"><div><b>Punch</b><small>Pick the tech and the job. Clocking in on a booked job moves it to In progress.</small></div>{myOpen && <span className="fxCCLive"><i />ON THE CLOCK</span>}</div>
        <div className="dxClkForm">
          <label>Technician<select value={techId} onChange={(e) => setTechId(e.target.value)}>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}{!techs.length && <option value="">Add a technician first</option>}</select></label>
          <label>Job<select value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={!!myOpen}>{techJobs.map((j) => <option key={j.id} value={j.id}>{new Date(j.scheduled_at).toLocaleDateString([], { month: "short", day: "numeric" })} · {j.customer_name || "Customer"} · {j.service_type}{j.assigned_tech_id === techId ? "" : " (not assigned)"}</option>)}{!techJobs.length && <option value="">No open jobs</option>}</select></label>
        </div>
        {myOpen ? (
          <div className="dxClkLive">
            <b className="dxClkTimer">{hms(now - new Date(myOpen.clock_in_at).valueOf())}</b>
            <span>{myOpen.customer_name || "Customer"} · {myOpen.service_type} · in at {new Date(myOpen.clock_in_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
            <button className="fxCCPrimary dxClkBig out" disabled={!!busy} onClick={() => void toggle(myOpen.job_id, techId)}>Clock out</button>
          </div>
        ) : (
          <button className="fxCCPrimary dxClkBig" disabled={!!busy || !techId || !jobId} onClick={() => void toggle(jobId, techId)}>Clock in</button>
        )}
      </section>

      <section className="fxCCPanel dxClkBoard">
        <div className="fxCCHead"><div><b>Who is on the clock</b><small>live timers · tap a card to clock that tech out</small></div></div>
        <div className="dxClkCards">
          {open.map((e) => (
            <article key={e.id}>
              <b>{e.tech_name || "Unassigned tech"}</b>
              <span className="dxClkTimer sm">{hms(now - new Date(e.clock_in_at).valueOf())}</span>
              <small>{e.customer_name || "Customer"} · {e.service_type}</small>
              <div><button className="fxCCMini" onClick={() => onOpenJob(e.job_id)}>Job</button><button className="fxCCMini danger" disabled={!!busy} onClick={() => void toggle(e.job_id, e.tech_id)}>Clock out</button></div>
            </article>
          ))}
          {loaded && !open.length && <div className="fxCCEmpty">Nobody is clocked in.</div>}
        </div>
      </section>

      <section className="fxCCPanel dxClkTechs">
        <div className="fxCCHead"><div><b>Hours by technician</b><small>today, with this week beside it</small></div></div>
        <div className="fxCCBars">
          {perTech.map((t) => <div key={t.id}><span><b>{t.name}{t.onClock ? " · on the clock" : ""}</b><em>{hm(t.todayMin)} today · {hm(t.weekMin)} week</em></span><i><b style={{ width: `${Math.round((t.todayMin / maxToday) * 100)}%` }} /></i></div>)}
          {!techs.length && <div className="fxCCEmpty">No technicians yet. Add them on the Team tab.</div>}
        </div>
      </section>

      <section className="fxCCPanel dxClkSheet">
        <div className="fxCCHead"><div><b>Timesheet</b><small>last 7 days · {entries.length} entries</small></div></div>
        <div className="fxInvTableWrap">
          <table className="fxInvTable dxClkTable">
            <thead><tr><th>Technician</th><th>Job</th><th>In</th><th>Out</th><th>Duration</th><th /></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className={e.clock_out_at ? "" : "live"}>
                  <td><b>{e.tech_name || "—"}</b></td>
                  <td><b>{e.customer_name || "Customer"}</b><small>{e.service_type}</small></td>
                  <td>{when(e.clock_in_at)}</td>
                  <td>{e.clock_out_at ? when(e.clock_out_at) : <span className="fxPill red">running</span>}</td>
                  <td>{hm(minutes(e, now))}</td>
                  <td><button className="fxCCMini" onClick={() => onOpenJob(e.job_id)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {loaded && !entries.length && <div className="fxCCEmpty">No time logged in the last 7 days.</div>}
        </div>
      </section>

      <div className="fxCCKpis fxInvKpis dxClkKpis">
        <article><i>◉</i><div><small>ON THE CLOCK</small><b>{kpis.onClock}</b><span>of {techs.length} techs</span></div></article>
        <article><i>◷</i><div><small>HOURS TODAY</small><b>{hm(kpis.todayMin)}</b><span>{today.length} punches</span></div></article>
        <article><i>▤</i><div><small>HOURS THIS WEEK</small><b>{hm(kpis.weekMin)}</b><span>{kpis.entries} entries</span></div></article>
        <article><i>✓</i><div><small>AVG PER ENTRY</small><b>{hm(kpis.entries ? kpis.weekMin / kpis.entries : 0)}</b><span>last 7 days</span></div></article>
        <article><i>$</i><div><small>LABOR COST</small><b>${Math.round(perTech.reduce((s, t) => s + (t.weekMin / 60) * ((t.hourly_rate_cents || 0) / 100), 0)).toLocaleString()}</b><span>this week at tech rates</span></div></article>
      </div>
    </div>
  );
}
