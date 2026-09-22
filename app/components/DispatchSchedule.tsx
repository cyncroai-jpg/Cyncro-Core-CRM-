"use client";
import { useEffect, useMemo, useState } from "react";

type JobRow = {
  id: string; customer_name: string | null; service_type: string; address: string; scheduled_at: string; status: string;
  assigned_tech_id: string | null; tech_name: string | null; revenue_cents: number; estimated_minutes: number | null; description: string | null;
};
type Tech = { id: string; name: string };
type GoogleStatus = { connected: boolean; email: string | null; syncedJobs: number; lastSyncAt: string | null; connectUrl: string };

const HOUR_START = 6, HOUR_END = 20; // 6am → 8pm
const HOURS = HOUR_END - HOUR_START;
const STATUSES = ["BOOKED", "ASSIGNED", "IN PROGRESS", "COMPLETE", "INVOICED", "CANCELLED"];
const tone = (s: string) => (s === "IN PROGRESS" ? "#ff2f4f" : s === "ASSIGNED" ? "#f3b23a" : s === "BOOKED" ? "#3fd982" : s === "CANCELLED" ? "#5f565b" : "#70a0d0");
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; };
const toLocalInput = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const money = (c: number) => `$${Math.round(c / 100).toLocaleString()}`;

export function DispatchSchedule({ onFlash, onOpenJob, onNew, refreshKey = 0 }: { onFlash: (m: string) => void; onOpenJob: (jobId: string) => void; onNew: () => void; refreshKey?: number }) {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [focus, setFocus] = useState(() => new Date());
  const [mode, setMode] = useState<"week" | "day">("week");
  const [techFilter, setTechFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState("");
  const [dragId, setDragId] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const [j, t, g] = await Promise.all([
      fetch("/api/dispatch/jobs").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dispatch/technicians").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dispatch/google-sync").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setJobs((j.jobs || []) as JobRow[]); setTechs((t.technicians || []) as Tech[]); setGoogle(g); setLoaded(true);
  };
  useEffect(() => { void load(); }, [refreshKey]);

  const days = useMemo(() => {
    if (mode === "day") { const d = new Date(focus); d.setHours(0, 0, 0, 0); return [d]; }
    const s = startOfWeek(focus); return Array.from({ length: 7 }, (_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return d; });
  }, [focus, mode]);
  const visible = useMemo(() => jobs.filter((j) => techFilter === "ALL" || (techFilter === "NONE" ? !j.assigned_tech_id : j.assigned_tech_id === techFilter)), [jobs, techFilter]);
  const byDay = useMemo(() => { const m = new Map<string, JobRow[]>(); for (const j of visible) { const k = dayKey(new Date(j.scheduled_at)); m.set(k, [...(m.get(k) || []), j]); } return m; }, [visible]);
  const selected = jobs.find((j) => j.id === selectedId) || null;
  useEffect(() => { if (selected) setWhen(toLocalInput(selected.scheduled_at)); }, [selected?.id, selected?.scheduled_at]);

  const weekJobs = useMemo(() => { const keys = new Set(days.map(dayKey)); return visible.filter((j) => keys.has(dayKey(new Date(j.scheduled_at)))); }, [visible, days]);
  const kpis = useMemo(() => ({
    count: weekJobs.filter((j) => j.status !== "CANCELLED").length,
    unassigned: weekJobs.filter((j) => !j.assigned_tech_id && j.status !== "CANCELLED").length,
    hours: Math.round(weekJobs.reduce((s, j) => s + (Number(j.estimated_minutes) || 60), 0) / 60),
    techs: new Set(weekJobs.map((j) => j.assigned_tech_id).filter(Boolean)).size,
    value: weekJobs.filter((j) => j.status !== "CANCELLED").reduce((s, j) => s + Number(j.revenue_cents || 0), 0),
  }), [weekJobs]);

  const patch = async (id: string, body: Record<string, unknown>, msg: string) => {
    setBusy(id);
    const r = await fetch("/api/dispatch/jobs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    const b = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { onFlash(b.error || "Could not update"); return; }
    onFlash(b.google === "created" || b.google === "updated" ? `${msg} · Google updated` : msg);
    await load();
  };
  const dropAt = (day: Date, minutesFromStart: number) => {
    if (!dragId) return;
    const job = jobs.find((j) => j.id === dragId); if (!job) return;
    const snapped = Math.round(minutesFromStart / 15) * 15;
    const d = new Date(day); d.setHours(HOUR_START, 0, 0, 0); d.setMinutes(snapped);
    setDragId("");
    void patch(job.id, { scheduledAt: d.toISOString() }, `Moved to ${d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`);
  };
  const syncAll = async () => {
    setBusy("sync");
    const r = await fetch("/api/dispatch/google-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const b = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { onFlash(b.error || "Sync failed"); return; }
    onFlash(`Google: ${b.created} added, ${b.updated} updated${b.failed ? `, ${b.failed} failed` : ""}`); await load();
  };
  const shift = (n: number) => { const d = new Date(focus); d.setDate(d.getDate() + (mode === "week" ? 7 * n : n)); setFocus(d); };
  const todayKey = dayKey(new Date());
  const nowLine = (() => { const n = new Date(); const m = (n.getHours() - HOUR_START) * 60 + n.getMinutes(); return m >= 0 && m <= HOURS * 60 ? (m / (HOURS * 60)) * 100 : null; })();
  const title = mode === "week" ? `Week of ${days[0].toLocaleDateString([], { month: "short", day: "numeric" })}` : focus.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="dxSch">
      <div className="dxCCTop">
        <div className="dxCCDate"><b>Schedule</b><small>{title} · {kpis.count} jobs · {kpis.unassigned} unassigned · drag a job to a new time</small></div>
        <div className="dxSchNav">
          <button onClick={() => shift(-1)} aria-label="Previous">‹</button>
          <button onClick={() => setFocus(new Date())}>Today</button>
          <button onClick={() => shift(1)} aria-label="Next">›</button>
          <span className="dxSchMode"><button className={mode === "week" ? "on" : ""} onClick={() => setMode("week")}>Week</button><button className={mode === "day" ? "on" : ""} onClick={() => setMode("day")}>Day</button></span>
          <select value={techFilter} onChange={(e) => setTechFilter(e.target.value)} aria-label="Technician filter"><option value="ALL">All techs</option><option value="NONE">Unassigned</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </div>
        <div className="fxCCActions"><button className="fxCCPrimary" onClick={onNew}>+ New job</button></div>
      </div>

      <section className="fxCCPanel dxSchGrid">
        <div className={`dxSchWeek ${mode}`} style={{ ["--hours" as string]: HOURS }}>
          <div className="dxSchHours"><span /> {Array.from({ length: HOURS }, (_, i) => <span key={i}>{((HOUR_START + i + 11) % 12) + 1}{HOUR_START + i < 12 ? "a" : "p"}</span>)}</div>
          {days.map((day) => {
            const k = dayKey(day); const list = (byDay.get(k) || []).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
            return (
              <div key={k} className={`dxSchDay ${k === todayKey ? "today" : ""}`}>
                <b>{day.toLocaleDateString([], { weekday: "short" })} <span>{day.getDate()}</span><small>{list.length ? `${list.length} job${list.length > 1 ? "s" : ""}` : ""}</small></b>
                <div className="dxSchCol" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); dropAt(day, ((e.clientY - rect.top) / rect.height) * HOURS * 60); }}>
                  {Array.from({ length: HOURS }, (_, i) => <i key={i} className="dxSchLine" style={{ top: `${(i / HOURS) * 100}%` }} />)}
                  {k === todayKey && nowLine !== null && <i className="dxSchNow" style={{ top: `${nowLine}%` }} />}
                  {list.map((j) => {
                    const d = new Date(j.scheduled_at); const startMin = Math.max(0, Math.min(HOURS * 60 - 20, (d.getHours() - HOUR_START) * 60 + d.getMinutes()));
                    const dur = Math.max(30, Number(j.estimated_minutes) || 60);
                    return (
                      <button key={j.id} draggable className={`dxSchBlock ${j.id === selectedId ? "sel" : ""} ${j.id === dragId ? "dragging" : ""}`} style={{ top: `${(startMin / (HOURS * 60)) * 100}%`, height: `${Math.min(100 - (startMin / (HOURS * 60)) * 100, (dur / (HOURS * 60)) * 100)}%`, ["--c" as string]: tone(j.status) }}
                        onClick={() => setSelectedId(j.id)} onDragStart={(e) => { setDragId(j.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragId("")} title={`${j.service_type} · ${j.customer_name || ""}`}>
                        <b>{fmtTime(j.scheduled_at)} {j.customer_name || "Customer"}</b><small>{j.service_type}{j.tech_name ? ` · ${j.tech_name}` : ""}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {loaded && !weekJobs.length && <div className="fxCCEmpty">Nothing scheduled {mode === "week" ? "this week" : "today"}. Create a job or drag one in from another week.</div>}
        <div className="dxSchLegend"><span><i style={{ background: "#3fd982" }} />Booked</span><span><i style={{ background: "#f3b23a" }} />Assigned</span><span><i style={{ background: "#ff2f4f" }} />In progress</span><span><i style={{ background: "#70a0d0" }} />Complete / invoiced</span></div>
      </section>

      <aside className="dxSchSide">
        <section className={`fxCCPanel ${selected ? "fxCCHero" : ""} dxSchDetail`}>
          {selected ? (
            <>
              <div className="fxCCHead"><div><b>{selected.customer_name || "Customer"}</b><small>{selected.service_type} · {selected.address}</small></div><span className="fxPill" style={{ color: tone(selected.status), borderColor: tone(selected.status) }}>{selected.status.toLowerCase()}</span></div>
              <label className="dxSchField">When<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
              <label className="dxSchField">Technician<select value={selected.assigned_tech_id || ""} onChange={(e) => void patch(selected.id, { assignedTechId: e.target.value || null, ...(e.target.value && selected.status === "BOOKED" ? { status: "ASSIGNED" } : {}) }, e.target.value ? "Technician assigned" : "Unassigned")}><option value="">Unassigned</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <label className="dxSchField">Status<select value={selected.status} onChange={(e) => void patch(selected.id, { status: e.target.value }, `Status: ${e.target.value.toLowerCase()}`)}>{STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select></label>
              <div className="dxSchActions">
                <button className="fxCCPrimary" disabled={!!busy || !when || toLocalInput(selected.scheduled_at) === when} onClick={() => void patch(selected.id, { scheduledAt: new Date(when).toISOString() }, "Rescheduled")}>Save time</button>
                <button onClick={() => onOpenJob(selected.id)}>Open job</button>
                {google?.connected && <button disabled={busy === "one"} onClick={async () => { setBusy("one"); const r = await fetch("/api/dispatch/google-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: selected.id }) }); const b = await r.json().catch(() => ({})); setBusy(""); onFlash(r.ok ? (b.created ? "Added to Google Calendar" : b.updated ? "Google event updated" : b.failed ? "Google rejected the event" : "Nothing to sync") : b.error || "Sync failed"); void load(); }}>Push to Google</button>}
              </div>
              <small className="dxSchHint">{money(selected.revenue_cents)} · {Number(selected.estimated_minutes) || 60} min estimate{selected.description ? ` · ${selected.description.slice(0, 80)}` : ""}</small>
            </>
          ) : (
            <div className="fxCCEmpty">Click a job on the calendar to reschedule, assign or push it to Google.</div>
          )}
        </section>

        <section className="fxCCPanel dxSchGoogle">
          <div className="fxCCHead"><div><b>Google Calendar</b><small>{google?.connected ? `Connected as ${google.email || "your Google account"}` : "Not connected for your login"}</small></div>{google?.connected ? <span className="fxCCLive"><i />LINKED</span> : <span className="fxPill amber">off</span>}</div>
          {google?.connected ? (
            <>
              <p>Jobs you create or move here are mirrored to your primary Google Calendar as events. {google.syncedJobs} job{google.syncedJobs === 1 ? "" : "s"} mirrored{google.lastSyncAt ? `, last ${new Date(google.lastSyncAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}.</p>
              <button className="fxCCPrimary" disabled={busy === "sync"} onClick={() => void syncAll()}>{busy === "sync" ? "Syncing…" : "Sync upcoming jobs to Google"}</button>
              <small>One-way: Cyncro → Google. Edits made in Google do not flow back. Each teammate connects their own Google account.</small>
            </>
          ) : (
            <>
              <p>Connect your Google account once and every job you schedule or move here shows up on your Google Calendar automatically.</p>
              <a className="fxCCPrimary dxSchConnect" href={google?.connectUrl || "/api/integrations/google-calendar/connect"}>Connect Google Calendar</a>
              <small>Needs the Google client ID and secret on the deployment. Sync is one-way, Cyncro → Google, per teammate.</small>
            </>
          )}
        </section>

        <section className="fxCCPanel dxSchAgenda">
          <div className="fxCCHead"><div><b>Today</b><small>{(byDay.get(todayKey) || []).length} jobs</small></div></div>
          <ul>
            {(byDay.get(todayKey) || []).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).map((j) => <li key={j.id} onClick={() => setSelectedId(j.id)}><i style={{ background: tone(j.status) }} /><b>{fmtTime(j.scheduled_at)}</b><span>{j.customer_name || "Customer"} · {j.service_type}</span><small>{j.tech_name || "unassigned"}</small></li>)}
            {!(byDay.get(todayKey) || []).length && <li className="dim">Nothing on the board today.</li>}
          </ul>
        </section>
      </aside>

      <div className="fxCCKpis fxInvKpis dxSchKpis">
        <article><i>▦</i><div><small>{mode === "week" ? "JOBS THIS WEEK" : "JOBS TODAY"}</small><b>{kpis.count}</b><span>{kpis.unassigned} unassigned</span></div></article>
        <article><i>◷</i><div><small>HOURS BOOKED</small><b>{kpis.hours}h</b><span>from estimates</span></div></article>
        <article><i>◎</i><div><small>TECHS SCHEDULED</small><b>{kpis.techs}</b><span>of {techs.length} on the team</span></div></article>
        <article><i>$</i><div><small>VALUE ON BOARD</small><b>{money(kpis.value)}</b><span>excluding cancelled</span></div></article>
        <article><i>G</i><div><small>GOOGLE</small><b>{google?.connected ? google.syncedJobs : "—"}</b><span>{google?.connected ? "jobs mirrored" : "not connected"}</span></div></article>
      </div>
    </div>
  );
}
