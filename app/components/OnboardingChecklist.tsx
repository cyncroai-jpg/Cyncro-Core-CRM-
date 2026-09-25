"use client";
import { useEffect, useState } from "react";

type Step = { key: string; label: string; hint: string; done: boolean; view: string };
type Data = { steps: Step[]; done: number; total: number; complete: boolean };

/** Shown on the CRM overview until every setup step is real. Nothing here is ticked by hand; it re-checks the database each load. */
export function OnboardingChecklist({ onView, onOpenCalendar }: { onView: (view: string) => void; onOpenCalendar: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem("cyncro.onboarding.hidden") === "1"; } catch { return false; } });
  useEffect(() => { void fetch("/api/crm/onboarding").then((r) => (r.ok ? r.json() : null)).then((x) => x && setD(x)).catch(() => undefined); }, []);
  if (!d || d.complete || hidden) return null;
  const next = d.steps.find((s) => !s.done);
  const go = (s: Step) => (s.view === "Calendar" ? onOpenCalendar() : onView(s.view));
  return (
    <section className="obCard">
      <div className="obHead">
        <div><small>GET SET UP · {d.done} OF {d.total} DONE</small><b>{next ? `Next: ${next.label}` : "All set"}</b><span>{next?.hint}</span></div>
        <div className="obMeter"><i style={{ width: `${Math.round((d.done / d.total) * 100)}%` }} /></div>
        <button className="obHide" onClick={() => { setHidden(true); try { sessionStorage.setItem("cyncro.onboarding.hidden", "1"); } catch { /* ignore */ } }} title="Hide for this session">Hide</button>
      </div>
      <ol className="obSteps">
        {d.steps.map((s) => <li key={s.key} className={s.done ? "done" : ""}><i>{s.done ? "✓" : ""}</i><div><b>{s.label}</b><small>{s.hint}</small></div>{!s.done && <button onClick={() => go(s)}>Do it →</button>}</li>)}
      </ol>
    </section>
  );
}
