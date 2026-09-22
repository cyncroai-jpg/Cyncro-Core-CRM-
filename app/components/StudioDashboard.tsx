"use client";
import { useEffect, useState } from "react";
import { Breakdown, DayBars, Delta, INK, RangeChips, fmt, money } from "./InsightCharts";

type Stats = {
  days: number; perDay: { day: string; views: number; submissions: number }[];
  pages: { id: string; slug: string; title: string; status: string; updated_at: string; views: number; views_period: number; submissions: number; submissions_period: number; contacts: number; deals: number; won: number; pipeline_cents: number; bookings: number; last_at: string | null; conversion: number }[];
  referrers: { referrer: string; n: number }[];
  recent: { id: string; created_at: string; answers_json: string; page_title: string; slug: string; contact_name: string | null; contact_id: string | null }[];
  totals: { pages: number; live: number; views: number; views_period: number; submissions: number; submissions_period: number; contacts_created: number; deals: number; pipeline_cents: number; conversion: number; submissions_prev: number };
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");

export function StudioDashboard({ onOpen }: { onOpen: (id: string) => void }) {
  const [days, setDays] = useState(30);
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { let live = true; fetch(`/api/studio/pages?stats=1&days=${days}`).then((r) => r.json()).then((d) => { if (live) setS(d); }).catch(() => undefined); return () => { live = false; }; }, [days]);
  if (!s) return <div className="fxCCEmpty inLoading">Loading dashboard…</div>;
  const t = s.totals;
  return (
    <div className="inDash">
      <div className="fxCCKpis fxInvKpis inKpis">
        <article><i>◉</i><div><small>PAGE VIEWS</small><b>{fmt(t.views_period)}</b><span>last {s.days} days · {fmt(t.views)} all time</span></div></article>
        <article><i>▤</i><div><small>LEADS</small><b>{fmt(t.submissions_period)}</b><span><Delta now={t.submissions_period} prev={t.submissions_prev} /></span></div></article>
        <article><i>%</i><div><small>CONVERSION</small><b>{t.conversion}%</b><span>leads per view, all time</span></div></article>
        <article><i>$</i><div><small>PIPELINE FROM PAGES</small><b>{money(t.pipeline_cents)}</b><span>{fmt(t.deals)} deals opened from landing pages</span></div></article>
        <article><i>◷</i><div><small>LIVE PAGES</small><b>{fmt(t.live)}<small style={{ display: "inline", fontSize: 12, color: "#8f858b" }}> / {fmt(t.pages)}</small></b><span>{fmt(t.contacts_created)} contacts created</span></div></article>
      </div>

      <section className="fxCCPanel">
        <div className="fxCCHead"><div><b>Views per day</b><small>each page load on a live page · last {s.days} days</small></div><RangeChips days={days} onChange={setDays} /></div>
        <DayBars points={s.perDay} series={[{ key: "views", label: "Views", color: INK.cool }]} height={130} />
      </section>
      <section className="fxCCPanel">
        <div className="fxCCHead"><div><b>Leads per day</b><small>form submissions on landing pages</small></div></div>
        <DayBars points={s.perDay} series={[{ key: "submissions", label: "Leads", color: INK.accent }]} height={130} />
      </section>

      <section className="fxCCPanel inWide">
        <div className="fxCCHead"><div><b>Page performance</b><small>views, leads, conversion and the revenue those leads turned into · click to open</small></div></div>
        <div className="fxInvTableWrap">
          <table className="fxInvTable inTable">
            <thead><tr><th>Page</th><th>Status</th><th>Views</th><th>Last {s.days}d</th><th>Leads</th><th>Last {s.days}d</th><th>Conversion</th><th>Bookings</th><th>Deals</th><th>Won</th><th>Pipeline</th><th>Last lead</th></tr></thead>
            <tbody>
              {s.pages.map((p) => (
                <tr key={p.id} onClick={() => onOpen(p.id)}>
                  <td><b>{p.title}</b><small>/s?slug={p.slug}</small></td>
                  <td><span className={`fxPill ${p.status === "PUBLISHED" ? "green" : ""}`}>{p.status}</span></td>
                  <td>{fmt(p.views)}</td><td>{fmt(p.views_period)}</td><td>{fmt(p.submissions)}</td><td>{fmt(p.submissions_period)}</td>
                  <td><div className="inRate" title={`${p.conversion}% of views became leads`}><i><b style={{ width: `${Math.min(100, p.conversion)}%` }} /></i><span>{p.views ? `${p.conversion}%` : "—"}</span></div></td>
                  <td>{fmt(p.bookings)}</td><td>{fmt(p.deals)}</td><td>{fmt(p.won)}</td><td>{money(p.pipeline_cents)}</td><td>{when(p.last_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!s.pages.length && <div className="fxCCEmpty">No landing pages yet. Create one on the Pages tab.</div>}
        </div>
      </section>

      <section className="fxCCPanel">
        <div className="fxCCHead"><div><b>Where visitors came from</b><small>referring site, last {s.days} days</small></div></div>
        <Breakdown items={s.referrers.map((r) => ({ label: r.referrer, n: Number(r.n) }))} color={INK.cool} empty="No views recorded yet. Share a live page link." />
      </section>
      <section className="fxCCPanel">
        <div className="fxCCHead"><div><b>Latest leads</b><small>newest first</small></div></div>
        <ul className="inList">
          {s.recent.map((r) => { let a: Record<string, string> = {}; try { a = JSON.parse(r.answers_json || "{}"); } catch {} return <li key={r.id}><b>{r.contact_name || a.name || a.email || "Lead"}</b><span>{r.page_title}{a.email ? ` · ${a.email}` : ""}</span><em>{when(r.created_at)}</em></li>; })}
          {!s.recent.length && <li className="fxCCEmpty">No leads yet.</li>}
        </ul>
      </section>
    </div>
  );
}
