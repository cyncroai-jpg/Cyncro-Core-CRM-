"use client";
import { useEffect, useState } from "react";
import { Breakdown, DayBars, Delta, INK, RangeChips, fmt } from "./InsightCharts";

type Stats = {
  days: number; perDay: { day: string; enrolled: number; done: number; failed: number }[];
  workflows: { id: string; name: string; trigger: string; active: number; last_run_at: string | null; enrolled: number; done: number; failed: number; active_now: number; stopped: number; emails: number; texts: number; enrolled_period: number; success_rate: number }[];
  kinds: { kind: string; n: number }[]; failures: { reason: string; n: number }[];
  upcoming: { id: string; next_run_at: string; step_index: number; workflow_name: string; contact_name: string | null }[];
  triggers: { trigger: string; n: number }[];
  totals: { workflows: number; active_workflows: number; enrolled_all: number; running: number; done_all: number; failed_all: number; emails_all: number; texts_all: number; tasks_all: number; enrolled_period: number; success_rate: number; enrolled_prev: number };
};
const KIND_LABEL: Record<string, string> = { ENROLLED: "Enrolled", SEND_EMAIL: "Emails sent", SEND_SMS: "Texts sent", WAIT: "Waits scheduled", IF: "Conditions checked", ADD_TAG: "Tags added", REMOVE_TAG: "Tags removed", CREATE_TASK: "Tasks created", ADD_NOTE: "Notes written", ASSIGN_REP: "Reps assigned", MOVE_STAGE: "Deals moved", SET_LIFECYCLE: "Lifecycles set", NOTIFY_TEAM: "Team notified", WEBHOOK: "Webhooks fired", DONE: "Finished", FAILED: "Failed", STOPPED: "Stopped by condition" };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");

export type AutomationsDashboardStats = Stats;
export function AutomationsDashboard({ triggerLabel, onOpen, days: daysProp, onStats, hideRange }: { triggerLabel: (t: string) => string; onOpen: (id: string) => void; days?: number; onStats?: (s: Stats) => void; hideRange?: boolean }) {
  const [daysState, setDays] = useState(30);
  const days = daysProp ?? daysState;
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { let live = true; fetch(`/api/crm/automations?stats=1&days=${days}`).then((r) => r.json()).then((d) => { if (live) { setS(d); onStats?.(d); } }).catch(() => undefined); return () => { live = false; }; }, [days]);
  if (!s) return <div className="fxCCEmpty inLoading">Loading dashboard…</div>;
  const t = s.totals;
  const perDay = s.perDay.map((p) => ({ day: p.day, done: p.done, failed: p.failed, other: Math.max(0, p.enrolled - p.done - p.failed) }));
  const stalled = s.workflows.filter((w) => w.active && !w.enrolled).length;
  return (
    <div className="inDash">
      <div className="fxCCKpis fxInvKpis inKpis">
        <article><i>◎</i><div><small>PEOPLE ENROLLED</small><b>{fmt(t.enrolled_period)}</b><span><Delta now={t.enrolled_period} prev={t.enrolled_prev} /></span></div></article>
        <article><i>✓</i><div><small>SUCCESS RATE</small><b>{t.success_rate}%</b><span>{fmt(t.done_all)} finished · {fmt(t.failed_all)} failed, all time</span></div></article>
        <article><i>◷</i><div><small>MID-WORKFLOW NOW</small><b>{fmt(t.running)}</b><span>{s.upcoming.length ? `next resumes ${when(s.upcoming[0].next_run_at)}` : "nothing waiting"}</span></div></article>
        <article><i>✉</i><div><small>MESSAGES SENT</small><b>{fmt(t.emails_all + t.texts_all)}</b><span>{fmt(t.emails_all)} emails · {fmt(t.texts_all)} texts</span></div></article>
        <article><i>⚡</i><div><small>WORKFLOWS ON</small><b>{fmt(t.active_workflows)}<small style={{ display: "inline", fontSize: 12, color: "#8f858b" }}> / {fmt(t.workflows)}</small></b><span>{stalled ? `${stalled} never triggered yet` : "all have run"}</span></div></article>
      </div>

      <section className="fxCCPanel inWide">
        <div className="fxCCHead"><div><b>Enrollments per day</b><small>who entered a workflow, by how it ended · last {s.days} days</small></div>{!hideRange && <RangeChips days={days} onChange={setDays} />}</div>
        <DayBars points={perDay} series={[{ key: "done", label: "Finished", color: INK.good }, { key: "other", label: "Running or stopped", color: INK.accent }, { key: "failed", label: "Failed", color: INK.warn }]} />
      </section>

      <section className="fxCCPanel inWide">
        <div className="fxCCHead"><div><b>Workflow leaderboard</b><small>every workflow, ranked by people enrolled · click to open</small></div></div>
        <div className="fxInvTableWrap">
          <table className="fxInvTable inTable">
            <thead><tr><th>Workflow</th><th>Trigger</th><th>Enrolled</th><th>Last {s.days}d</th><th>Running</th><th>Finished</th><th>Failed</th><th>Success</th><th>Emails</th><th>Texts</th><th>Last run</th></tr></thead>
            <tbody>
              {s.workflows.map((w) => (
                <tr key={w.id} onClick={() => onOpen(w.id)} className={w.active ? "" : "off"}>
                  <td><b>{w.name}</b><small>{w.active ? "on" : "paused"}</small></td>
                  <td>{triggerLabel(w.trigger)}</td>
                  <td>{fmt(w.enrolled)}</td><td>{fmt(w.enrolled_period)}</td><td>{fmt(w.active_now)}</td><td>{fmt(w.done)}</td>
                  <td>{w.failed ? <span className="fxPill amber">{fmt(w.failed)}</span> : "0"}</td>
                  <td><div className="inRate" title={`${w.success_rate}% of finished runs succeeded`}><i><b style={{ width: `${w.success_rate}%` }} /></i><span>{w.enrolled ? `${w.success_rate}%` : "—"}</span></div></td>
                  <td>{fmt(w.emails)}</td><td>{fmt(w.texts)}</td><td>{when(w.last_run_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!s.workflows.length && <div className="fxCCEmpty">No workflows yet. Start from a recipe on the Workflows tab.</div>}
        </div>
      </section>

      <section className="fxCCPanel">
        <div className="fxCCHead"><div><b>What automations did</b><small>actions logged in the last {s.days} days</small></div></div>
        <Breakdown items={s.kinds.filter((k) => !["ENROLLED"].includes(k.kind)).map((k) => ({ label: KIND_LABEL[k.kind] || k.kind, n: Number(k.n) }))} empty="No actions logged in this period." />
      </section>
      <section className="fxCCPanel">
        <div className="fxCCHead"><div><b>Enrollments by trigger</b><small>which events start the most workflows</small></div></div>
        <Breakdown items={s.triggers.filter((x) => Number(x.n) > 0).map((x) => ({ label: triggerLabel(x.trigger), n: Number(x.n) }))} color={INK.cool} empty="Nothing has triggered a workflow in this period." />
      </section>
      <section className="fxCCPanel">
        <div className="fxCCHead"><div><b>Coming up</b><small>people waiting on a timed step · the scheduler resumes them</small></div></div>
        <ul className="inList">
          {s.upcoming.map((u) => <li key={u.id}><b>{u.contact_name || "Contact"}</b><span>{u.workflow_name} · step {u.step_index + 1}</span><em>{when(u.next_run_at)}</em></li>)}
          {!s.upcoming.length && <li className="fxCCEmpty">Nobody is waiting on a timer.</li>}
        </ul>
      </section>
      <section className="fxCCPanel">
        <div className="fxCCHead"><div><b>Why runs failed</b><small>top reasons, all time · fix the cause and re-run from the workflow</small></div></div>
        <Breakdown items={s.failures.map((f) => ({ label: f.reason.length > 70 ? f.reason.slice(0, 70) + "…" : f.reason, n: Number(f.n) }))} color={INK.warn} empty="No failures. Nice." />
      </section>
    </div>
  );
}
