"use client";
import { useEffect, useMemo, useState } from "react";

/** Lender row exactly as `SELECT * FROM auto_lenders` returns it. */
export type LenderRow = {
  id: string; name: string; min_credit_score: number | null; max_advance_pct: number | null; buy_rate: number | null; reserve_pct: number | null;
  active: number; notes: string | null; lender_type: string | null; region: string | null; website: string | null; phone: string | null;
};

const TYPES: { key: string; label: string; blurb: string }[] = [
  { key: "CAPTIVE", label: "Captive finance", blurb: "Manufacturer-backed lenders. Best rates on new and CPO units of their own brand." },
  { key: "BANK", label: "Banks & prime", blurb: "National and Florida banks. Prime and near-prime paper, strongest reserve on 700+ scores." },
  { key: "CREDIT_UNION", label: "Credit unions", blurb: "Member-owned. Low buy rates, flexible advance, great for Florida buyers who already bank there." },
  { key: "SUBPRIME", label: "Subprime & special finance", blurb: "Deep-approval lenders for thin or bruised credit. Higher rates, fees, and stips." },
  { key: "OTHER", label: "Other", blurb: "Lenders you added without a type." },
];
const typeLabel = (t: string | null) => TYPES.find((x) => x.key === t)?.label || "Other";
const fmt = (v: number | null, suffix = "") => (v === null || v === undefined ? "" : `${v}${suffix}`);

type Edit = { minCreditScore: string; maxAdvancePct: string; buyRate: string; reservePct: string; phone: string; notes: string };
const editFrom = (l: LenderRow): Edit => ({ minCreditScore: fmt(l.min_credit_score), maxAdvancePct: fmt(l.max_advance_pct), buyRate: fmt(l.buy_rate), reservePct: fmt(l.reserve_pct), phone: l.phone || "", notes: l.notes || "" });

export function AutoLenderDirectory({ onFlash }: { onFlash: (m: string) => void }) {
  const [lenders, setLenders] = useState<LenderRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [type, setType] = useState("ALL");
  const [region, setRegion] = useState("ALL");
  const [onlyActive, setOnlyActive] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => fetch("/api/automotive?resource=lenders").then((r) => r.json()).then((d: { lenders?: LenderRow[] }) => { setLenders(d.lenders || []); setLoaded(true); });
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return lenders.filter((l) =>
      (type === "ALL" || (l.lender_type || "OTHER") === type) &&
      (region === "ALL" || (l.region || "") === region) &&
      (!onlyActive || l.active) &&
      (!needle || l.name.toLowerCase().includes(needle) || (l.notes || "").toLowerCase().includes(needle)));
  }, [lenders, q, type, region, onlyActive]);
  const groups = useMemo(() => TYPES.map((t) => ({ ...t, rows: filtered.filter((l) => (l.lender_type || "OTHER") === t.key) })).filter((g) => g.rows.length), [filtered]);

  const kpis = useMemo(() => ({
    total: lenders.length,
    active: lenders.filter((l) => l.active).length,
    florida: lenders.filter((l) => l.region === "Florida").length,
    cus: lenders.filter((l) => l.lender_type === "CREDIT_UNION").length,
    priced: lenders.filter((l) => l.buy_rate !== null || l.min_credit_score !== null).length,
  }), [lenders]);

  const loadDirectory = async () => {
    setBusy(true); setError("");
    const r = await fetch("/api/automotive?resource=lender-directory", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(b.error || "Could not load the directory."); return; }
    onFlash(b.added ? `Added ${b.added} lenders from the directory` : "Directory already loaded — nothing new to add");
    await load();
  };
  const patch = async (id: string, body: Record<string, unknown>) => {
    const r = await fetch(`/api/automotive?resource=lenders&id=${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { const b = await r.json().catch(() => ({})); setError(b.error || "Could not save."); return false; }
    return true;
  };
  const saveEdit = async () => {
    if (!edit || !editingId) return;
    if (await patch(editingId, edit)) { onFlash("Lender terms saved"); setEditingId(""); setEdit(null); await load(); }
  };
  const toggleActive = async (l: LenderRow) => { if (await patch(l.id, { active: !l.active })) { onFlash(`${l.name} ${l.active ? "paused" : "active"}`); await load(); } };
  const remove = async (l: LenderRow) => {
    if (!window.confirm(`Remove ${l.name} from your lender directory?`)) return;
    const r = await fetch(`/api/automotive?resource=lenders&id=${l.id}`, { method: "DELETE" });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { setError(b.error || "Could not remove."); return; }
    onFlash(b.deactivated ? `${l.name} has submissions, so it was paused instead of deleted` : `${l.name} removed`);
    await load();
  };
  const addLender = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(["name", "lenderType", "region", "minCreditScore", "maxAdvancePct", "buyRate", "reservePct", "website", "phone", "notes"].map((k) => [k, String(f.get(k) || "")]));
    setBusy(true); setError("");
    const r = await fetch("/api/automotive?resource=lenders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(b.error || "Could not add lender."); return; }
    onFlash(`${body.name} added`); setAdding(false); await load();
  };

  return (
    <div className="fxDesk fxLend">
      <div className="fxCCTop">
        <div className="fxCCTitle"><b>Lender directory</b><small>{kpis.total} lenders · {kpis.active} active · {kpis.florida} Florida-based · rates and tiers come from your own dealer agreements</small></div>
        <div className="fxInvSearch">
          <input placeholder="Search lenders…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search lenders" />
          <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region"><option value="ALL">Florida + national</option><option value="Florida">Florida only</option><option value="National">National only</option></select>
          <label className="fxLendToggle"><input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> Active only</label>
        </div>
        <div className="fxCCActions">
          <button onClick={() => void loadDirectory()} disabled={busy}>{busy ? "Loading…" : "Load Florida + national directory"}</button>
          <button className="fxCCPrimary" onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "+ Add lender"}</button>
        </div>
      </div>

      <div className="fxLendChips">
        <button className={type === "ALL" ? "on" : ""} onClick={() => setType("ALL")}>All <em>{lenders.length}</em></button>
        {TYPES.filter((t) => t.key !== "OTHER" || lenders.some((l) => !l.lender_type)).map((t) => (
          <button key={t.key} className={type === t.key ? "on" : ""} onClick={() => setType(t.key)}>{t.label} <em>{lenders.filter((l) => (l.lender_type || "OTHER") === t.key).length}</em></button>
        ))}
      </div>

      {adding && (
        <form className="fxCCPanel fxCCHero fxLendAdd" onSubmit={(e) => void addLender(e)}>
          <div className="fxCCHead"><div><b>Add a lender</b><small>Anything not in the directory — a local credit union, a buy-here-pay-here partner, a private lender.</small></div></div>
          <div className="fxInvFields">
            <label className="wide">Lender name<input name="name" required placeholder="e.g. Bank of Tampa" /></label>
            <label>Type<select name="lenderType" defaultValue="BANK">{TYPES.filter((t) => t.key !== "OTHER").map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
            <label>Region<select name="region" defaultValue="Florida"><option>Florida</option><option>National</option></select></label>
            <label>Min score<input name="minCreditScore" inputMode="numeric" placeholder="620" /></label>
            <label>Max advance %<input name="maxAdvancePct" inputMode="decimal" placeholder="120" /></label>
            <label>Buy rate %<input name="buyRate" inputMode="decimal" placeholder="6.49" /></label>
            <label>Reserve %<input name="reservePct" inputMode="decimal" placeholder="1.5" /></label>
            <label>Website<input name="website" placeholder="https://" /></label>
            <label>Phone<input name="phone" placeholder="Dealer desk line" /></label>
            <label className="wide">Notes<input name="notes" placeholder="Program notes, rep name, stips they always ask for…" /></label>
          </div>
          <div className="fxInvSave"><button type="button" onClick={() => setAdding(false)}>Cancel</button><button className="fxCCPrimary" type="submit" disabled={busy}>Add lender</button></div>
        </form>
      )}

      {error && <div className="fxInvError fxCCWide">{error}</div>}

      {loaded && !lenders.length && (
        <section className="fxCCPanel fxCCHero fxLendEmpty">
          <b>Your directory is empty.</b>
          <p>Load the built-in list — captive lenders, the big national banks, subprime and special-finance lenders, and Florida credit unions like Suncoast, VyStar, Space Coast, GTE, MIDFLORIDA and more — then fill in the tiers and rates from your dealer agreements.</p>
          <button className="fxCCPrimary" onClick={() => void loadDirectory()} disabled={busy}>{busy ? "Loading…" : "Load Florida + national directory"}</button>
        </section>
      )}
      {loaded && lenders.length > 0 && !filtered.length && <div className="fxCCEmpty fxCCWide">No lenders match that filter.</div>}

      {groups.map((g) => (
        <section className="fxCCPanel fxLendGroup" key={g.key}>
          <div className="fxCCHead"><div><b>{g.label}</b><small>{g.blurb}</small></div><span className="fxCCLive"><i />{g.rows.length}</span></div>
          <div className="fxLendGrid">
            {g.rows.map((l) => {
              const editing = editingId === l.id && edit;
              const host = l.website ? l.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "") : "";
              return (
                <article key={l.id} className={`fxLendCard ${l.active ? "" : "off"} ${editing ? "editing" : ""}`}>
                  <div className="fxLendHead">
                    <div><b>{l.name}</b><small>{l.region === "Florida" ? <span className="fxPill red">Florida</span> : <span className="fxPill">National</span>} {host && <a href={l.website!} target="_blank" rel="noreferrer">{host} ↗</a>}</small></div>
                    <button className={`fxLendSwitch ${l.active ? "on" : ""}`} onClick={() => void toggleActive(l)} aria-label={`${l.active ? "Pause" : "Activate"} ${l.name}`} title={l.active ? "Active — click to pause" : "Paused — click to activate"}><i /></button>
                  </div>
                  {editing ? (
                    <div className="fxLendEdit">
                      <label>Min score<input value={edit.minCreditScore} onChange={(e) => setEdit({ ...edit, minCreditScore: e.target.value })} inputMode="numeric" /></label>
                      <label>Max adv %<input value={edit.maxAdvancePct} onChange={(e) => setEdit({ ...edit, maxAdvancePct: e.target.value })} inputMode="decimal" /></label>
                      <label>Buy rate %<input value={edit.buyRate} onChange={(e) => setEdit({ ...edit, buyRate: e.target.value })} inputMode="decimal" /></label>
                      <label>Reserve %<input value={edit.reservePct} onChange={(e) => setEdit({ ...edit, reservePct: e.target.value })} inputMode="decimal" /></label>
                      <label className="wide">Phone<input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
                      <label className="wide">Notes<input value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="Rep, program quirks, stips…" /></label>
                      <div className="fxInvSave"><button type="button" onClick={() => { setEditingId(""); setEdit(null); }}>Cancel</button><button className="fxCCPrimary" type="button" onClick={() => void saveEdit()}>Save terms</button></div>
                    </div>
                  ) : (
                    <>
                      <div className="fxLendTiers">
                        <span><small>MIN SCORE</small><b>{l.min_credit_score ?? "—"}</b></span>
                        <span><small>MAX ADV</small><b>{l.max_advance_pct !== null ? `${l.max_advance_pct}%` : "—"}</b></span>
                        <span><small>BUY RATE</small><b>{l.buy_rate !== null ? `${l.buy_rate}%` : "—"}</b></span>
                        <span><small>RESERVE</small><b>{l.reserve_pct !== null ? `${l.reserve_pct}%` : "—"}</b></span>
                      </div>
                      {(l.notes || l.phone) && <p>{[l.phone, l.notes].filter(Boolean).join(" · ")}</p>}
                      {l.buy_rate === null && l.min_credit_score === null && <p className="dim">No terms yet — add your program tiers from the dealer agreement.</p>}
                      <div className="fxLendFoot">
                        <button className="fxCCMini" onClick={() => { setEditingId(l.id); setEdit(editFrom(l)); setError(""); }}>Edit terms</button>
                        <button className="fxCCMini danger" onClick={() => void remove(l)}>Remove</button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <div className="fxCCKpis fxInvKpis">
        <article><i>▤</i><div><small>LENDERS</small><b>{kpis.total}</b><span>{kpis.active} active</span></div></article>
        <article><i>☀</i><div><small>FLORIDA-BASED</small><b>{kpis.florida}</b><span>banks + credit unions</span></div></article>
        <article><i>◈</i><div><small>CREDIT UNIONS</small><b>{kpis.cus}</b><span>member-owned</span></div></article>
        <article><i>%</i><div><small>WITH TERMS</small><b>{kpis.priced}</b><span>{kpis.total - kpis.priced} still need rates</span></div></article>
        <article><i>⚑</i><div><small>SUBMISSIONS</small><b>Manual</b><span>logged here, not sent by API</span></div></article>
      </div>
    </div>
  );
}
