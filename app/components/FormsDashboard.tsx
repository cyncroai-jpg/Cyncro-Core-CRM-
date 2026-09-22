"use client";
import { useEffect, useState } from "react";
import { Breakdown, DayBars, Delta, INK, RangeChips, fmt } from "./InsightCharts";

type Stats = {
  days: number; perDay: { day: string; submissions: number; signed: number }[];
  forms: { id: string; title: string; status: string; requires_signature: number; updated_at: string; submissions: number; submissions_period: number; signed: number; files: number; people: number; last_at: string | null; automations_started: number; after_submit: "book" | "message"; booking_event: string; tags: string; assign_to: string }[];
  recent: { id: string; respondent_name: string; respondent_email: string; submitted_at: string; signature_name: string | null; form_title: string; contact_id: string | null }[];
  totals: { forms: number; live: number; submissions: number; submissions_period: number; signed: number; files: number; contacts_created: number; sign_rate: number; submissions_prev: number; handoff: { book: number; message: number; tagged: number; assigned: number } };
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");

export function FormsDashboard({ onOpen }: { onOpen: (id: string) => void }) {
  const [days, setDays] = useState(30);
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { let live = true; fetch(`/api/crm/forms?stats=1&days=${days}`).then((r) => r.json()).then((d) => { if (live) setS(d); }).catch(() => undefined); return () => { live = false; }; }, [days]);
  if (!s) return <div className="fxCCEmpty inLoading">Loading dashboard…</div>;
  const t = s.totals;
  const perDay = s.perDay.map((p) => ({ day: p.day, signed: p.signed, unsigned: Math.max(0, p.submissions - p.signed) }));
  return (
    <div className="inDash">
      <div className="fxCCKpis fxInvKpis inKpis">
        <article><i>▤</i><div><small>RESPONSES</small><b>{fmt(t.submissions_period)}</b><span><Delta now={t.submissions_period} prev={t.submissions_prev} /></span></div></article>
        <article><i>✍</i><div><small>SIGNED</small><b>{t.sign_rate}%</b><span>{fmt(t.signed)} of {fmt(t.submissions)} carry an e-signature</span></div></article>
        <article><i>◎</i><div><small>CONTACTS CREATED</small><b>{fmt(t.contacts_created)}</b><span>new people who came in through a form</span></div></article>
        <article><i>▣</i><div><small>FILES COLLECTED</small><b>{fmt(t.files)}</b><span>documents and photos attached</span></div></article>
        <article><i>◷</i><div><small>LIVE FORMS</small><b>{fmt(t.live)}<small style={{ display: "inline", fontSize: 12, color: "#8f858b" }}> / {fmt(t.forms)}</small></b><span>{t.handoff.book} send to booking · {t.handoff.tagged} tag · {t.handoff.assigned} assign</span></div></article>
      </div>

      <section className="fxCCPanel inWide">
        <div className="fxCCHead"><div><b>Responses per day</b><small>signed vs unsigned · last {s.days} days</small></div><RangeChips days={days} onChange={setDays} /></div>
        <DayBars points={perDay} series={[{ key: "signed", label: "Signed", color: INK.good }, { key: "unsigned", label: "Unsigned", color: INK.accent }]} />
      </section>

      <section className="fxCCPanel inWide">
        <div className="fxCCHead"><div><b>Form performance</b><small>every form with what happens after submit · click to open</small></div></div>
        <div className="fxInvTableWrap">
          <table className="fxInvTable inTable">
            <thead><tr><th>Form</th><th>Status</th><th>Responses</th><th>Last {s.days}d</th><th>People</th><th>Signed</th><th>Files</th><th>After submit</th><th>Automations</th><th>Last response</th></tr></thead>
            <tbody>
              {s.forms.map((f) => (
                <tr key={f.id} onClick={() => onOpen(f.id)}>
                  <td><b>{f.title}</b><small>{f.requires_signature ? "signature required" : "no signature"}</small></td>
                  <td><span className={`fxPill ${f.status === "PUBLISHED" ? "green" : ""}`}>{f.status}</span></td>
                  <td>{fmt(f.submissions)}</td><td>{fmt(f.submissions_period)}</td><td>{fmt(f.people)}</td><td>{fmt(f.signed)}</td><td>{fmt(f.files)}</td>
                  <td><b>{f.after_submit === "book" ? `Book${f.booking_event ? `: ${f.booking_event}` : ""}` : "Thank-you"}</b><small>{[f.tags ? `tags ${f.tags}` : "", f.assign_to ? `→ ${f.assign_to}` : ""].filter(Boolean).join(" · ") || "no tags or owner"}</small></td>
                  <td>{fmt(f.automations_started)}</td>
                  <td>{when(f.last_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!s.forms.length && <div className="fxCCEmpty">No forms yet. Build one on the Forms tab.</div>}
        </div>
      </section>

      <section className="fxCCPanel">
        <div className="fxCCHead"><div><b>Top forms</b><small>responses in the last {s.days} days</small></div></div>
        <Breakdown items={s.forms.filter((f) => f.submissions_period > 0).map((f) => ({ label: f.title, n: f.submissions_period }))} empty="No responses in this period." />
      </section>
      <section className="fxCCPanel">
        <div className="fxCCHead"><div><b>Latest responses</b><small>newest first</small></div></div>
        <ul className="inList">
          {s.recent.map((r) => <li key={r.id}><b>{r.respondent_name}</b><span>{r.form_title} · {r.respondent_email}{r.signature_name ? " · signed" : ""}</span><em>{when(r.submitted_at)}</em></li>)}
          {!s.recent.length && <li className="fxCCEmpty">Nothing submitted yet. Share a form link.</li>}
        </ul>
      </section>
    </div>
  );
}
