"use client";
import { useEffect, useMemo, useState } from "react";

type Person = { email: string; display_name: string; role: string; plan: { rate: number; basis: string; residualFlat: number; notes: string; set: boolean }; month: { entries: number; revenue_cents: number; cost_cents: number; profit_cents: number; payout_cents: number; paid_cents: number; pending_cents: number } };
type Entry = { id: string; month: string; member_email: string; label: string; deal_id: string | null; revenue_cents: number; cost_cents: number; rate_bps: number; basis: string; payout_cents: number; status: string; paid_at: string | null; notes: string | null; created_at: string };
type Deal = { id: string; name: string; stage: string; value_cents: number; cost_cents: number; collected_cents: number; payment_status: string; commission_rate_bps: number; commission_status: string; assigned_rep: string | null; service_kind: string | null; updated_at: string; account_name: string; logged: number };
type Rule = { id: string; service_name: string; applies_to: string; percentage_bps: number };
type Hist = { month: string; revenue_cents: number; profit_cents: number; payout_cents: number; paid_cents: number };
type Data = { month: string; canManage: boolean; people: Person[]; entries: Entry[]; deals: Deal[]; rules: Rule[]; history: Hist[] };

const usd = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(c / 100);
const usd2 = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
const monthLabel = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const shiftMonth = (m: string, by: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + by, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const STATUS_TONE: Record<string, string> = { PENDING: "amber", APPROVED: "cool", PAID: "green", HOLD: "amber", CLAWBACK: "red" };

/** Dedicated Commissions page: who earns what this month, logged from real profit, paid out per person. */
export function CommissionsDesk({ onFlash }: { onFlash: (m: string) => void }) {
  const [month, setMonth] = useState(thisMonth());
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ memberEmail: "", label: "", revenue: "", cost: "", rate: "", basis: "", notes: "" });
  const [planEdit, setPlanEdit] = useState<Record<string, { rate: string; basis: string; residualFlat: string }>>({});
  const load = async (m = month) => { const r = await fetch(`/api/crm/commissions?month=${m}`, { cache: "no-store" }); const j = await r.json(); if (!r.ok) return onFlash(j.error || "Commissions could not load"); setD(j); };
  useEffect(() => { void load(month); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps
  const people = d?.people || []; const entries = d?.entries || [];
  const byEmail = useMemo(() => Object.fromEntries(people.map((p) => [p.email.toLowerCase(), p])), [people]);
  const name = (email: string) => byEmail[email.toLowerCase()]?.display_name || email;
  const totals = useMemo(() => people.reduce((a, p) => ({ revenue: a.revenue + p.month.revenue_cents, cost: a.cost + p.month.cost_cents, profit: a.profit + p.month.profit_cents, payout: a.payout + p.month.payout_cents, paid: a.paid + p.month.paid_cents, pending: a.pending + p.month.pending_cents }), { revenue: 0, cost: 0, profit: 0, payout: 0, paid: 0, pending: 0 }), [people]);
  const call = async (method: string, body?: unknown, qs = "") => { const r = await fetch(`/api/crm/commissions${qs}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) { onFlash(j.error || "That didn't save"); return null; } return j; };
  const selected = form.memberEmail ? byEmail[form.memberEmail.toLowerCase()] : undefined;
  const effRate = form.rate !== "" ? Number(form.rate) : selected?.plan.rate ?? 20;
  const effBasis = form.basis || selected?.plan.basis || "PROFIT";
  const preview = Math.max(0, Math.round(((effBasis === "REVENUE" ? Number(form.revenue || 0) : Number(form.revenue || 0) - Number(form.cost || 0)) * effRate) / 100) * 100);
  const addEntry = async () => {
    if (!form.memberEmail) return onFlash("Pick who earns this");
    setBusy("entry"); const j = await call("POST", { action: "entry", month, ...form }); setBusy("");
    if (j) { setForm({ memberEmail: form.memberEmail, label: "", revenue: "", cost: "", rate: "", basis: "", notes: "" }); await load(); onFlash(`Logged · ${name(form.memberEmail)} earns ${usd2(j.payout_cents)}`); }
  };
  const savePlan = async (p: Person) => {
    const e = planEdit[p.email] || { rate: String(p.plan.rate), basis: p.plan.basis, residualFlat: String(p.plan.residualFlat) };
    setBusy(`plan:${p.email}`); const j = await call("POST", { action: "plan", memberEmail: p.email, rate: Number(e.rate), basis: e.basis, residualFlat: Number(e.residualFlat || 0) }); setBusy("");
    if (j) { setPlanEdit((x) => { const n = { ...x }; delete n[p.email]; return n; }); await load(); onFlash(`${p.display_name} now earns ${j.rate}% of ${j.basis.toLowerCase()}`); }
  };
  const patch = async (id: string, updates: Record<string, unknown>) => { const j = await call("PATCH", { id, updates }); if (j) { await load(); } };
  const payMonth = async (p: Person) => {
    if (!window.confirm(`Mark ${usd2(p.month.pending_cents)} as paid to ${p.display_name} for ${monthLabel(month)}?`)) return;
    const j = await call("PATCH", { action: "payMonth", month, memberEmail: p.email }); if (j) { await load(); onFlash(`${p.display_name} paid for ${monthLabel(month)}`); }
  };
  const remove = async (e: Entry) => { if (!window.confirm(`Delete "${e.label}"?`)) return; const j = await call("DELETE", undefined, `?id=${e.id}`); if (j) { await load(); onFlash("Entry removed"); } };
  const logDeal = async (deal: Deal) => {
    const who = deal.assigned_rep || form.memberEmail; if (!who) return onFlash("Assign the deal to a teammate first");
    const revenue = (deal.collected_cents || deal.value_cents) / 100;
    const j = await call("POST", { action: "entry", month, memberEmail: who, label: `${deal.name} · ${deal.account_name}`, dealId: deal.id, revenue, cost: deal.cost_cents / 100, rate: deal.commission_rate_bps ? deal.commission_rate_bps / 100 : undefined });
    if (j) { await load(); onFlash(`Deal logged to ${monthLabel(month)} · ${usd2(j.payout_cents)} commission`); }
  };
  const assignDeal = async (deal: Deal, updates: Record<string, unknown>) => { const r = await fetch("/api/crm/opportunities", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: deal.id, updates }) }); if (!r.ok) return onFlash("Deal could not be updated"); await load(); };
  const exportCsv = () => {
    const rows = [["Month", "Person", "For", "Revenue", "Cost", "Profit", "Basis", "Rate %", "Commission", "Status", "Paid at"], ...entries.map((e) => [e.month, name(e.member_email), e.label, (e.revenue_cents / 100).toFixed(2), (e.cost_cents / 100).toFixed(2), ((e.revenue_cents - e.cost_cents) / 100).toFixed(2), e.basis, (e.rate_bps / 100).toFixed(2), (e.payout_cents / 100).toFixed(2), e.status, e.paid_at || ""])];
    const blob = new Blob([rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `commissions-${month}.csv`; a.click(); URL.revokeObjectURL(a.href); onFlash("Commission sheet downloaded");
  };
  if (!d) return <div className="cmDesk"><div className="crmPanel cmLoading">Loading commissions…</div></div>;
  const manage = d.canManage; const maxHist = Math.max(1, ...d.history.map((h) => Math.max(Number(h.profit_cents), Number(h.payout_cents))));
  return (
    <div className="cmDesk">
      <section className="crmPanel cmHead">
        <div><small>{manage ? "COMMISSIONS DESK" : "MY COMMISSIONS"}</small><h2>{monthLabel(month)}</h2><p>{manage ? "Log the month's revenue and cost per person, set anyone's rate, approve, and pay. Every number below comes from what's been logged here." : "What you've earned from logged profit this month. Owners and admins log and pay."}</p></div>
        <div className="cmMonthNav">
          <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
          {month !== thisMonth() && <button onClick={() => setMonth(thisMonth())}>This month</button>}
          <button onClick={exportCsv}>↓ CSV</button>
        </div>
      </section>
      <section className="cmKpis">
        <article><small>REVENUE LOGGED</small><b>{usd(totals.revenue)}</b><span>{entries.length} entr{entries.length === 1 ? "y" : "ies"}</span></article>
        <article><small>COST</small><b>{usd(totals.cost)}</b><span>what it took to deliver</span></article>
        <article className="hi"><small>PROFIT</small><b>{usd(totals.profit)}</b><span>{totals.revenue ? `${Math.round((totals.profit / totals.revenue) * 100)}% margin` : "nothing logged yet"}</span></article>
        <article><small>COMMISSION OWED</small><b>{usd(totals.pending)}</b><span>{usd(totals.paid)} already paid</span></article>
      </section>
      {d.history.length > 1 && (
        <section className="crmPanel cmHistory">
          <div className="crmPanelHead"><div><small>LAST {d.history.length} MONTHS</small><h2>Profit vs commission</h2></div><div className="cmLegend"><i className="p" /> profit <i className="c" /> commission</div></div>
          <div className="cmBars">{d.history.map((h) => <button key={h.month} className={h.month === month ? "on" : ""} onClick={() => setMonth(h.month)} title={`${monthLabel(h.month)} · profit ${usd(Number(h.profit_cents))} · commission ${usd(Number(h.payout_cents))}`}>
            <span><i className="p" style={{ height: `${Math.max(2, (Number(h.profit_cents) / maxHist) * 100)}%` }} /><i className="c" style={{ height: `${Math.max(2, (Number(h.payout_cents) / maxHist) * 100)}%` }} /></span><small>{h.month.slice(5)}/{h.month.slice(2, 4)}</small></button>)}</div>
        </section>
      )}
      <section className="crmPanel cmPeople">
        <div className="crmPanelHead"><div><small>PEOPLE</small><h2>{people.length} teammate{people.length === 1 ? "" : "s"}</h2><p>{manage ? "Each person's default rate applies to new entries. Change it here any time; past entries keep theirs." : ""}</p></div>{manage && <a className="cyAiMini" href="#crm/team-access">Add teammates in Team Access</a>}</div>
        <div className="cmPeopleList">
          {people.map((p) => { const e = planEdit[p.email]; return (
            <article key={p.email} className="cmPerson">
              <div className="cmWho"><b>{p.display_name}</b><small>{p.email} · {p.role.toLowerCase()}</small></div>
              <div className="cmPlan">
                {manage ? <>
                  <label>Rate<div className="cmPct"><input type="number" min="0" max="100" step="0.5" value={e ? e.rate : p.plan.rate} onChange={(ev) => setPlanEdit({ ...planEdit, [p.email]: { rate: ev.target.value, basis: e?.basis || p.plan.basis, residualFlat: e?.residualFlat || String(p.plan.residualFlat) } })} /><b>%</b></div></label>
                  <label>of<select value={e ? e.basis : p.plan.basis} onChange={(ev) => setPlanEdit({ ...planEdit, [p.email]: { rate: e?.rate || String(p.plan.rate), basis: ev.target.value, residualFlat: e?.residualFlat || String(p.plan.residualFlat) } })}><option value="PROFIT">profit</option><option value="REVENUE">revenue</option></select></label>
                  {e && <button className="coSave" disabled={busy === `plan:${p.email}`} onClick={() => void savePlan(p)}>Save</button>}
                  {!e && !p.plan.set && <small className="cmHint">default 20% of profit</small>}
                </> : <span className="cmRate">{p.plan.rate}% of {p.plan.basis.toLowerCase()}</span>}
              </div>
              <div className="cmNums"><span><small>PROFIT</small><b>{usd(p.month.profit_cents)}</b></span><span><small>EARNED</small><b>{usd(p.month.payout_cents)}</b></span><span><small>PAID</small><b className={p.month.pending_cents ? "" : "ok"}>{usd(p.month.paid_cents)}</b></span></div>
              <div className="cmPay">{p.month.pending_cents > 0 ? <><b>{usd2(p.month.pending_cents)} owed</b>{manage && <button className="coSave" onClick={() => void payMonth(p)}>Pay {monthLabel(month).split(" ")[0]}</button>}</> : <span className="fxPill green">{p.month.entries ? "ALL PAID" : "NOTHING LOGGED"}</span>}</div>
            </article>); })}
          {!people.length && <p className="cmEmpty">No teammates yet.</p>}
        </div>
      </section>
      {manage && (
        <section className="crmPanel cmAdd">
          <div className="crmPanelHead"><div><small>LOG THIS MONTH</small><h2>Add revenue and cost for someone</h2><p>Enter what was billed and what it cost. Commission is worked out from the person's rate, or override it for this entry.</p></div></div>
          <div className="cmAddGrid">
            <label>Who earns it<select value={form.memberEmail} onChange={(e) => setForm({ ...form, memberEmail: e.target.value })}><option value="">Pick a teammate…</option>{people.map((p) => <option key={p.email} value={p.email}>{p.display_name}</option>)}</select></label>
            <label className="wide">What for<input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Acme automation build, March retainer" /></label>
            <label>Revenue $<input type="number" min="0" step="0.01" value={form.revenue} onChange={(e) => setForm({ ...form, revenue: e.target.value })} placeholder="0.00" /></label>
            <label>Cost $<input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="0.00" /></label>
            <label>Rate %<input type="number" min="0" max="100" step="0.5" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} placeholder={selected ? `${selected.plan.rate} (their rate)` : "20"} /></label>
            <label>of<select value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value })}><option value="">{selected ? `${selected.plan.basis.toLowerCase()} (their default)` : "profit"}</option><option value="PROFIT">profit</option><option value="REVENUE">revenue</option></select></label>
            <label className="wide">Notes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Split, bonus, or why the rate differs" /></label>
            <div className="cmPreview"><small>COMMISSION</small><b>{usd2(preview)}</b><span>{effRate}% of {effBasis.toLowerCase()} {usd2(Math.round((effBasis === "REVENUE" ? Number(form.revenue || 0) : Number(form.revenue || 0) - Number(form.cost || 0)) * 100))}</span></div>
            <button className="coSave cmAddBtn" disabled={busy === "entry" || !form.memberEmail || !form.label} onClick={() => void addEntry()}>{busy === "entry" ? "Saving…" : "Log it"}</button>
          </div>
          {d.rules.length > 0 && <div className="cmPresets"><small>RATE PRESETS</small>{d.rules.map((r) => <button key={r.id} onClick={() => setForm({ ...form, rate: String(r.percentage_bps / 100) })} title={r.applies_to}>{r.service_name} · {r.percentage_bps / 100}%</button>)}</div>}
        </section>
      )}
      <section className="crmPanel cmLedger">
        <div className="crmPanelHead"><div><small>ENTRIES · {monthLabel(month).toUpperCase()}</small><h2>{entries.length ? `${usd(totals.payout)} in commission across ${entries.length} entr${entries.length === 1 ? "y" : "ies"}` : "Nothing logged for this month yet"}</h2></div></div>
        {entries.length > 0 && <div className="cmTable"><header><span>Person</span><span>For</span><span>Revenue</span><span>Cost</span><span>Rate</span><span>Commission</span><span>Status</span><span /></header>
          {entries.map((e) => <div key={e.id} className="cmRow">
            <span>{manage ? <select value={e.member_email} onChange={(ev) => void patch(e.id, { memberEmail: ev.target.value })}>{people.map((p) => <option key={p.email} value={p.email}>{p.display_name}</option>)}</select> : <b>{name(e.member_email)}</b>}</span>
            <span><b>{e.label}</b>{e.notes && <small>{e.notes}</small>}{e.deal_id && <small>from a deal</small>}</span>
            <span>{manage ? <input type="number" min="0" step="0.01" defaultValue={(e.revenue_cents / 100).toFixed(2)} onBlur={(ev) => Number(ev.target.value) * 100 !== e.revenue_cents && void patch(e.id, { revenue: ev.target.value })} /> : usd2(e.revenue_cents)}</span>
            <span>{manage ? <input type="number" min="0" step="0.01" defaultValue={(e.cost_cents / 100).toFixed(2)} onBlur={(ev) => Number(ev.target.value) * 100 !== e.cost_cents && void patch(e.id, { cost: ev.target.value })} /> : usd2(e.cost_cents)}</span>
            <span>{manage ? <div className="cmPct"><input type="number" min="0" max="100" step="0.5" defaultValue={e.rate_bps / 100} onBlur={(ev) => Number(ev.target.value) * 100 !== e.rate_bps && void patch(e.id, { rate: ev.target.value })} /><b>%</b></div> : `${e.rate_bps / 100}%`}<small>of {e.basis.toLowerCase()}</small></span>
            <span><b className="cmPayout">{usd2(e.payout_cents)}</b></span>
            <span>{manage ? <select className={`cmStatus ${STATUS_TONE[e.status]}`} value={e.status} onChange={(ev) => void patch(e.id, { status: ev.target.value })}>{["PENDING", "APPROVED", "PAID", "HOLD", "CLAWBACK"].map((s) => <option key={s}>{s}</option>)}</select> : <em className={`fxPill ${STATUS_TONE[e.status]}`}>{e.status}</em>}{e.paid_at && <small>paid {new Date(e.paid_at).toLocaleDateString()}</small>}</span>
            <span>{manage && <button className="dangerText" onClick={() => void remove(e)}>Delete</button>}</span>
          </div>)}
        </div>}
      </section>
      <section className="crmPanel cmDeals">
        <div className="crmPanelHead"><div><small>CLOSED DEALS</small><h2>{d.deals.length} deal{d.deals.length === 1 ? "" : "s"} won or collecting</h2><p>{manage ? "Assign each deal to a teammate, fix the rate, and log it into a month with one click." : "Deals assigned to you."}</p></div></div>
        {d.deals.length > 0 ? <div className="cmTable deals"><header><span>Deal</span><span>Rep</span><span>Collected / value</span><span>Rate</span><span>Service</span><span /></header>
          {d.deals.map((deal) => <div key={deal.id} className="cmRow">
            <span><b>{deal.name}</b><small>{deal.account_name} · {deal.stage.toLowerCase()} · {deal.payment_status.toLowerCase()}</small></span>
            <span>{manage ? <select value={deal.assigned_rep || ""} onChange={(ev) => void assignDeal(deal, { assignedRep: ev.target.value })}><option value="">Unassigned</option>{people.map((p) => <option key={p.email} value={p.email}>{p.display_name}</option>)}</select> : <b>{deal.assigned_rep ? name(deal.assigned_rep) : "Unassigned"}</b>}</span>
            <span><b>{usd2(deal.collected_cents || 0)}</b><small>of {usd2(deal.value_cents)}</small></span>
            <span>{manage ? <div className="cmPct"><input type="number" min="0" max="100" step="0.5" defaultValue={deal.commission_rate_bps / 100} onBlur={(ev) => Number(ev.target.value) * 100 !== deal.commission_rate_bps && void assignDeal(deal, { commissionRate: ev.target.value })} /><b>%</b></div> : `${deal.commission_rate_bps / 100}%`}</span>
            <span>{manage ? <select value={deal.service_kind || ""} onChange={(ev) => void assignDeal(deal, { serviceKind: ev.target.value })}><option value="">—</option><option value="AUTOMATION">Automation</option><option value="WEBSITE">Website</option><option value="LANDING_PAGE">Landing page</option><option value="RETAINER">Retainer</option><option value="OTHER">Other</option></select> : <small>{deal.service_kind || "—"}</small>}</span>
            <span>{manage && <button className="cyAiMini" onClick={() => void logDeal(deal)}>{deal.logged ? `Log again` : `Log to ${monthLabel(month).split(" ")[0]}`}</button>}{deal.logged > 0 && <small>logged {deal.logged}×</small>}</span>
          </div>)}
        </div> : <p className="cmEmpty">No won deals yet. Move a deal to Closed Won in Pipeline and it shows here.</p>}
      </section>
    </div>
  );
}
