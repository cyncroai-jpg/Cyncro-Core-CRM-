"use client";
import { useState } from "react";
import { AutomationsDashboard, type AutomationsDashboardStats } from "./AutomationsDashboard";
import { FormsDashboard, type FormsDashboardStats } from "./FormsDashboard";
import { StudioDashboard, type StudioDashboardStats } from "./StudioDashboard";
import { DayBars, Delta, INK, RangeChips, fmt, money } from "./InsightCharts";

/**
 * One page for the whole funnel: landing pages -> forms -> automations.
 * The three area dashboards render below and hand their stats up so the
 * combined strip and chart come from the same fetches (no double loading).
 */
export function GrowthDashboard({ triggerLabel, onGo }: { triggerLabel: (t: string) => string; onGo: (view: "Studio" | "Forms" | "Automations") => void }) {
  const [days, setDays] = useState(30);
  const [au, setAu] = useState<AutomationsDashboardStats | null>(null);
  const [fo, setFo] = useState<FormsDashboardStats | null>(null);
  const [st, setSt] = useState<StudioDashboardStats | null>(null);
  const ready = au && fo && st;
  const perDay = ready ? st.perDay.map((p, i) => ({ day: p.day, leads: p.submissions, responses: fo.perDay[i]?.submissions || 0, enrolled: au.perDay[i]?.enrolled || 0 })) : [];
  const leadsNow = (st?.totals.submissions_period || 0) + (fo?.totals.submissions_period || 0);
  const leadsPrev = (st?.totals.submissions_prev || 0) + (fo?.totals.submissions_prev || 0);
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="gwHub">
      <div className="dxCCTop">
        <div className="dxCCDate"><b>Growth dashboard</b><small>landing pages, forms and automations in one view · last {days} days · every number is your company's real data</small></div>
        <div className="fxLendChips">
          <button onClick={() => jump("gw-studio")}>Landing pages</button><button onClick={() => jump("gw-forms")}>Forms</button><button onClick={() => jump("gw-automations")}>Automations</button>
        </div>
        <div className="fxCCActions"><RangeChips days={days} onChange={setDays} /></div>
      </div>

      <div className="fxCCKpis fxInvKpis gwKpis">
        <article><i>◉</i><div><small>PAGE VIEWS</small><b>{fmt(st?.totals.views_period || 0)}</b><span>{fmt(st?.totals.live || 0)} live pages</span></div></article>
        <article><i>▤</i><div><small>NEW LEADS</small><b>{fmt(leadsNow)}</b><span><Delta now={leadsNow} prev={leadsPrev} /></span></div></article>
        <article><i>%</i><div><small>PAGE CONVERSION</small><b>{st?.totals.conversion ?? 0}%</b><span>leads per view</span></div></article>
        <article><i>⚡</i><div><small>AUTOMATED</small><b>{fmt(au?.totals.enrolled_period || 0)}</b><span>{fmt((au?.totals.emails_all || 0) + (au?.totals.texts_all || 0))} messages sent all time</span></div></article>
        <article><i>$</i><div><small>PIPELINE FROM PAGES</small><b>{money(st?.totals.pipeline_cents || 0)}</b><span>{fmt(st?.totals.deals || 0)} deals opened</span></div></article>
      </div>

      <section className="fxCCPanel gwWide">
        <div className="fxCCHead"><div><b>Funnel activity per day</b><small>landing-page leads, form responses and workflow enrollments · same day axis</small></div></div>
        {ready ? <DayBars points={perDay} series={[{ key: "leads", label: "Landing-page leads", color: INK.cool }, { key: "responses", label: "Form responses", color: INK.good }, { key: "enrolled", label: "Workflow enrollments", color: INK.accent }]} height={170} /> : <div className="fxCCEmpty inLoading">Loading…</div>}
      </section>

      <section className="gwBlock" id="gw-studio">
        <div className="gwBlockHead"><div><small>LANDING PAGES</small><b>Studio</b></div><button className="fxCCMini" onClick={() => onGo("Studio")}>Open Studio →</button></div>
        <StudioDashboard days={days} hideRange onStats={setSt} onOpen={() => onGo("Studio")} />
      </section>
      <section className="gwBlock" id="gw-forms">
        <div className="gwBlockHead"><div><small>FORMS</small><b>Intake &amp; questionnaires</b></div><button className="fxCCMini" onClick={() => onGo("Forms")}>Open Forms →</button></div>
        <FormsDashboard days={days} hideRange onStats={setFo} onOpen={() => onGo("Forms")} />
      </section>
      <section className="gwBlock" id="gw-automations">
        <div className="gwBlockHead"><div><small>AUTOMATIONS</small><b>Workflows</b></div><button className="fxCCMini" onClick={() => onGo("Automations")}>Open Automations →</button></div>
        <AutomationsDashboard days={days} hideRange onStats={setAu} triggerLabel={triggerLabel} onOpen={() => onGo("Automations")} />
      </section>
    </div>
  );
}
