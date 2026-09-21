"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuxCar } from "./LuxCar";

/** Vehicle row exactly as `SELECT * FROM auto_inventory` returns it. */
export type InventoryVehicle = {
  id: string; stock_number: string; vin: string | null; year: number | null; make: string | null; model: string | null;
  trim: string | null; mileage: number | null; color: string | null; body_style: string | null; drivetrain: string | null;
  book_value_cents: number | null; asking_price_cents: number; acquisition_cost_cents: number | null; recon_cost_cents: number | null;
  kbb_value_cents: number | null; jdpower_value_cents: number | null; mmr_value_cents: number | null;
  acquired_at: string | null; notes: string | null; status: string; created_at: string; updated_at: string;
};

const STATUSES = ["AVAILABLE", "PENDING", "SOLD", "WHOLESALE", "IN_RECON", "HOLD"];
const money = (c: number | null | undefined) => (c === null || c === undefined ? "—" : `${c < 0 ? "-" : ""}$${Math.round(Math.abs(c) / 100).toLocaleString()}`);
const dollars = (c: number | null | undefined) => (c === null || c === undefined ? "" : String(Math.round(c) / 100));
const pct = (v: number | null) => (v === null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`);

/** Header aliases → API field names. Headers are normalised to lowercase alphanumerics before matching. */
const HEADER_ALIASES: Record<string, string[]> = {
  stockNumber: ["stock", "stocknumber", "stockno", "stocknum", "stk", "stkno", "unit", "unitnumber"],
  vin: ["vin", "vinnumber"],
  year: ["year", "yr", "modelyear"],
  make: ["make", "manufacturer", "brand"],
  model: ["model"],
  trim: ["trim", "trimlevel", "series"],
  mileage: ["mileage", "miles", "odometer", "odo"],
  askingPrice: ["askingprice", "asking", "price", "listprice", "internetprice", "retail", "retailprice", "sellingprice", "saleprice"],
  acquisitionCost: ["acquisitioncost", "acquisition", "cost", "purchaseprice", "acv", "buyprice", "unitcost", "invoice", "acquiredfor"],
  reconCost: ["reconcost", "recon", "reconditioning", "reconditioningcost", "repairs"],
  bookValue: ["bookvalue", "book"],
  kbbValue: ["kbb", "kbbvalue", "kelley", "kelleybluebook", "bluebook"],
  jdpowerValue: ["jdpower", "jdpowervalue", "nada", "nadavalue", "jdpowerclean", "jd"],
  mmrValue: ["mmr", "manheim", "mmrvalue"],
  color: ["color", "colour", "exteriorcolor", "extcolor", "exterior"],
  bodyStyle: ["bodystyle", "body", "bodytype", "style"],
  drivetrain: ["drivetrain", "drive", "drivetype", "awd4wd"],
  acquiredAt: ["acquiredat", "acquired", "datein", "instockdate", "stockdate", "purchasedate", "dateacquired", "arrived"],
  notes: ["notes", "comments", "note", "description"],
  status: ["status", "state"],
};
const FIELD_LABEL: Record<string, string> = {
  stockNumber: "Stock #", vin: "VIN", year: "Year", make: "Make", model: "Model", trim: "Trim", mileage: "Mileage", askingPrice: "Asking $",
  acquisitionCost: "Acquisition $", reconCost: "Recon $", bookValue: "Book $", kbbValue: "KBB $", jdpowerValue: "J.D. Power $", mmrValue: "MMR $",
  color: "Color", bodyStyle: "Body", drivetrain: "Drivetrain", acquiredAt: "Acquired", notes: "Notes", status: "Status",
};
const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
function mapHeader(h: string): string | null {
  const n = norm(h);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) if (aliases.includes(n)) return field;
  return null;
}

/** Small RFC-4180-ish parser: quoted fields, escaped quotes, CRLF, auto-detects comma / tab / semicolon / pipe. */
export function parseDelimited(text: string): string[][] {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || "";
  const delim = [",", "\t", ";", "|"].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export function rowsToImport(grid: string[][]): { mapping: { header: string; field: string | null }[]; rows: Record<string, string>[] } {
  if (!grid.length) return { mapping: [], rows: [] };
  const mapping = grid[0].map((h) => ({ header: h.trim(), field: mapHeader(h) }));
  const rows = grid.slice(1).map((r) => {
    const o: Record<string, string> = {};
    mapping.forEach((m, i) => { if (m.field && r[i] !== undefined && r[i].trim() !== "") o[m.field] = r[i].trim(); });
    return o;
  }).filter((o) => Object.keys(o).length);
  return { mapping, rows };
}

function csvEscape(v: unknown) { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
export function toCsv(list: InventoryVehicle[]) {
  const head = ["Stock #", "VIN", "Year", "Make", "Model", "Trim", "Mileage", "Color", "Body", "Drivetrain", "Status", "Asking Price", "Acquisition Cost", "Recon Cost", "KBB", "JD Power", "MMR", "Book Value", "Acquired", "Notes"];
  const lines = list.map((v) => [v.stock_number, v.vin, v.year, v.make, v.model, v.trim, v.mileage, v.color, v.body_style, v.drivetrain, v.status,
    dollars(v.asking_price_cents), dollars(v.acquisition_cost_cents), dollars(v.recon_cost_cents), dollars(v.kbb_value_cents), dollars(v.jdpower_value_cents), dollars(v.mmr_value_cents), dollars(v.book_value_cents),
    v.acquired_at ? v.acquired_at.slice(0, 10) : "", v.notes].map(csvEscape).join(","));
  return [head.join(","), ...lines].join("\n");
}

function daysOnLot(v: InventoryVehicle) {
  const start = new Date(v.acquired_at || v.created_at).valueOf();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 86400000));
}

/** Deal-math for one unit. Every number is cents; null means "not enough info". */
export function profitDesk(v: InventoryVehicle) {
  const acq = v.acquisition_cost_cents ?? null;
  const recon = v.recon_cost_cents ?? 0;
  const costBasis = acq === null ? null : acq + recon;
  const asking = v.asking_price_cents || 0;
  const refs = [
    { key: "kbb", label: "KBB", value: v.kbb_value_cents },
    { key: "jdp", label: "J.D. Power", value: v.jdpower_value_cents },
    { key: "mmr", label: "MMR", value: v.mmr_value_cents },
    { key: "book", label: "Book", value: v.book_value_cents },
  ].filter((r) => r.value !== null && r.value !== undefined && r.value > 0) as { key: string; label: string; value: number }[];
  const market = refs.find((r) => r.key === "kbb") || refs.find((r) => r.key === "jdp") || refs[0] || null;
  const gross = costBasis === null ? null : asking - costBasis;
  const margin = gross === null || !asking ? null : gross / asking;
  const priceToMarket = market && asking ? asking / market.value : null;
  const roomToMarket = market && costBasis !== null ? market.value - costBasis : null;
  const ladder: { label: string; price: number; gross: number | null; margin: number | null; current?: boolean }[] = [];
  const push = (label: string, price: number, current = false) => {
    if (!price || price <= 0) return;
    const g = costBasis === null ? null : price - costBasis;
    ladder.push({ label, price, gross: g, margin: g === null ? null : g / price, current });
  };
  if (market) push(`${market.label} × 105%`, Math.round(market.value * 1.05));
  for (const r of refs) push(`${r.label} value`, r.value);
  push("Asking", asking, true);
  push("Asking − $500", asking - 50000);
  push("Asking − $1,000", asking - 100000);
  push("Asking − $1,500", asking - 150000);
  if (costBasis !== null) push("Breakeven", costBasis);
  ladder.sort((a, b) => b.price - a.price);
  const days = daysOnLot(v);
  return { costBasis, asking, gross, margin, market, refs, priceToMarket, roomToMarket, ladder, days, acq, recon };
}

type Draft = Record<string, string>;
function draftFrom(v: InventoryVehicle): Draft {
  return {
    stockNumber: v.stock_number, vin: v.vin || "", year: v.year ? String(v.year) : "", make: v.make || "", model: v.model || "", trim: v.trim || "",
    mileage: v.mileage !== null ? String(v.mileage) : "", color: v.color || "", bodyStyle: v.body_style || "", drivetrain: v.drivetrain || "", status: v.status,
    askingPrice: dollars(v.asking_price_cents), acquisitionCost: dollars(v.acquisition_cost_cents), reconCost: dollars(v.recon_cost_cents),
    kbbValue: dollars(v.kbb_value_cents), jdpowerValue: dollars(v.jdpower_value_cents), mmrValue: dollars(v.mmr_value_cents), bookValue: dollars(v.book_value_cents),
    acquiredAt: v.acquired_at ? v.acquired_at.slice(0, 10) : "", notes: v.notes || "",
  };
}

const EMPTY: InventoryVehicle = {
  id: "", stock_number: "", vin: null, year: null, make: null, model: null, trim: null, mileage: null, color: null, body_style: null, drivetrain: null,
  book_value_cents: null, asking_price_cents: 0, acquisition_cost_cents: null, recon_cost_cents: null, kbb_value_cents: null, jdpower_value_cents: null, mmr_value_cents: null,
  acquired_at: null, notes: null, status: "AVAILABLE", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

export function AutoInventoryDesk({ onFlash }: { onFlash: (m: string) => void }) {
  const [inventory, setInventory] = useState<InventoryVehicle[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState<"newest" | "gross" | "days" | "price">("newest");
  const [selectedId, setSelectedId] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [adding, setAdding] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => fetch("/api/automotive?resource=inventory").then((r) => r.json()).then((d: { inventory?: InventoryVehicle[] }) => { setInventory(d.inventory || []); setLoaded(true); });
  useEffect(() => { void load(); }, []);

  const selected = useMemo(() => inventory.find((v) => v.id === selectedId) || null, [inventory, selectedId]);
  useEffect(() => {
    if (adding) return;
    if (selected) setDraft(draftFrom(selected));
    else if (inventory.length && !selectedId) setSelectedId(inventory[0].id);
    else if (!selected) setDraft(null);
  }, [selected, inventory, selectedId, adding]);

  const desks = useMemo(() => new Map(inventory.map((v) => [v.id, profitDesk(v)])), [inventory]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = inventory.filter((v) => (status === "ALL" || v.status === status) && (!needle || [v.stock_number, v.vin, v.year, v.make, v.model, v.trim, v.color].join(" ").toLowerCase().includes(needle)));
    const d = (v: InventoryVehicle) => desks.get(v.id)!;
    if (sort === "gross") list.sort((a, b) => (d(b).gross ?? -1e12) - (d(a).gross ?? -1e12));
    if (sort === "days") list.sort((a, b) => d(b).days - d(a).days);
    if (sort === "price") list.sort((a, b) => b.asking_price_cents - a.asking_price_cents);
    return list;
  }, [inventory, q, status, sort, desks]);

  const kpis = useMemo(() => {
    const live = inventory.filter((v) => !["SOLD", "WHOLESALE"].includes(v.status));
    const sum = (f: (v: InventoryVehicle) => number | null) => live.reduce((a, v) => a + (f(v) || 0), 0);
    const withCost = live.filter((v) => desks.get(v.id)!.costBasis !== null);
    const aged = live.filter((v) => desks.get(v.id)!.days >= 60).length;
    const avgDays = live.length ? Math.round(live.reduce((a, v) => a + desks.get(v.id)!.days, 0) / live.length) : 0;
    return { units: live.length, asking: sum((v) => v.asking_price_cents), cost: sum((v) => desks.get(v.id)!.costBasis), gross: withCost.reduce((a, v) => a + (desks.get(v.id)!.gross || 0), 0), withCost: withCost.length, aged, avgDays };
  }, [inventory, desks]);

  const set = (k: string, val: string) => setDraft((d) => ({ ...(d || {}), [k]: val }));
  const previewVehicle: InventoryVehicle | null = useMemo(() => {
    if (!draft) return null;
    const base = selected && !adding ? selected : EMPTY;
    const cents = (s: string) => (s.trim() === "" ? null : Math.round(Number(s.replace(/[^0-9.\-]/g, "")) * 100));
    return {
      ...base, stock_number: draft.stockNumber, vin: draft.vin || null, year: draft.year ? Number(draft.year) : null, make: draft.make || null, model: draft.model || null, trim: draft.trim || null,
      mileage: draft.mileage ? Number(draft.mileage) : null, color: draft.color || null, body_style: draft.bodyStyle || null, drivetrain: draft.drivetrain || null, status: draft.status || "AVAILABLE",
      asking_price_cents: cents(draft.askingPrice) || 0, acquisition_cost_cents: cents(draft.acquisitionCost), recon_cost_cents: cents(draft.reconCost),
      kbb_value_cents: cents(draft.kbbValue), jdpower_value_cents: cents(draft.jdpowerValue), mmr_value_cents: cents(draft.mmrValue), book_value_cents: cents(draft.bookValue),
      acquired_at: draft.acquiredAt ? new Date(draft.acquiredAt).toISOString() : base.acquired_at, notes: draft.notes || null,
    };
  }, [draft, selected, adding]);
  const desk = previewVehicle ? profitDesk(previewVehicle) : null;

  const save = async () => {
    if (!draft) return;
    if (!draft.stockNumber.trim()) { setError("A stock number is required."); return; }
    if (!draft.askingPrice.trim()) { setError("An asking price is required."); return; }
    setSaving(true); setError("");
    const url = adding ? "/api/automotive?resource=inventory" : `/api/automotive?resource=inventory&id=${selectedId}`;
    const r = await fetch(url, { method: adding ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const b = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setError(b.error || "Could not save this vehicle."); return; }
    onFlash(adding ? "Vehicle added" : "Vehicle saved");
    await load();
    if (adding) { setAdding(false); if (b.id) setSelectedId(b.id); }
  };
  const remove = async (ids: string[]) => {
    if (!ids.length) return;
    if (!window.confirm(ids.length === 1 ? "Delete this vehicle from inventory?" : `Delete ${ids.length} vehicles from inventory?`)) return;
    const r = ids.length === 1
      ? await fetch(`/api/automotive?resource=inventory&id=${ids[0]}`, { method: "DELETE" })
      : await fetch(`/api/automotive?resource=inventory-bulk&id=x&ids=${ids.join(",")}`, { method: "DELETE" });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { setError(b.error || "Could not delete."); onFlash(b.error || "Could not delete"); return; }
    onFlash(ids.length === 1 ? "Vehicle deleted" : `${b.deleted} deleted${b.blocked ? `, ${b.blocked} kept (attached to deals)` : ""}`);
    setChecked(new Set()); if (ids.includes(selectedId)) setSelectedId("");
    await load();
  };
  const quickStatus = async (v: InventoryVehicle, st: string) => {
    await fetch(`/api/automotive?resource=inventory&id=${v.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: st }) });
    onFlash(`${v.stock_number} → ${st.replace("_", " ")}`); await load();
  };
  const exportCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(a.href); onFlash(`Exported ${filtered.length} vehicles`);
  };
  const startAdd = () => { setAdding(true); setSelectedId(""); setDraft(draftFrom(EMPTY)); setError(""); };
  const toggleAll = () => setChecked((c) => (c.size === filtered.length ? new Set() : new Set(filtered.map((v) => v.id))));

  const ymm = (v: InventoryVehicle) => [v.year, v.make, v.model].filter(Boolean).join(" ") || "Unnamed unit";
  const enc = (s: string | null | undefined) => encodeURIComponent((s || "").toLowerCase().replace(/\s+/g, "-"));
  const kbbUrl = previewVehicle?.make && previewVehicle.model && previewVehicle.year ? `https://www.kbb.com/${enc(previewVehicle.make)}/${enc(previewVehicle.model)}/${previewVehicle.year}/` : "https://www.kbb.com/whats-my-car-worth/";
  const jdpUrl = previewVehicle?.make && previewVehicle.model && previewVehicle.year ? `https://www.jdpower.com/cars/${previewVehicle.year}/${enc(previewVehicle.make)}/${enc(previewVehicle.model)}` : "https://www.jdpower.com/cars";
  const mmrUrl = "https://mmr.manheim.com/";

  return (
    <div className="fxDesk fxInv">
      <div className="fxCCTop">
        <div className="fxCCTitle"><b>Inventory desk</b><small>{inventory.length} units on the books · {kpis.units} live · Profit desk on every unit</small></div>
        <div className="fxInvSearch">
          <input placeholder="Search stock #, VIN, year, make, model…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inventory" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
            <option value="ALL">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
            <option value="newest">Newest first</option><option value="gross">Highest gross</option><option value="days">Longest on lot</option><option value="price">Highest price</option>
          </select>
        </div>
        <div className="fxCCActions">
          {checked.size > 0 && <button onClick={() => void remove([...checked])} className="fxInvDanger">Delete {checked.size} selected</button>}
          <button onClick={exportCsv} disabled={!filtered.length}>Export CSV</button>
          <button onClick={() => setImportOpen(true)}>Import CSV / bulk</button>
          <button className="fxCCPrimary" onClick={startAdd}>+ Add vehicle</button>
        </div>
      </div>

      <section className="fxCCPanel fxInvTablePanel">
        <div className="fxCCHead"><div><b>Units</b><small>{filtered.length} shown · click a row to open its profit desk · change status right in the row</small></div><span className="fxCCLive"><i />LIVE</span></div>
        <div className="fxInvTableWrap">
          <table className="fxInvTable">
            <thead><tr>
              <th><input type="checkbox" aria-label="Select all" checked={filtered.length > 0 && checked.size === filtered.length} onChange={toggleAll} /></th>
              <th>Stock #</th><th>Vehicle</th><th>Miles</th><th>Cost basis</th><th>Asking</th><th>Gross</th><th>Market</th><th>Days</th><th>Status</th><th />
            </tr></thead>
            <tbody>
              {filtered.map((v) => {
                const d = desks.get(v.id)!;
                const tone = d.gross === null ? "" : d.gross < 0 ? "neg" : d.margin !== null && d.margin >= 0.12 ? "hot" : "";
                return (
                  <tr key={v.id} className={`${v.id === selectedId ? "sel" : ""} ${tone}`} onClick={() => { setAdding(false); setSelectedId(v.id); setError(""); }}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${v.stock_number}`} checked={checked.has(v.id)} onChange={() => setChecked((c) => { const n = new Set(c); if (n.has(v.id)) n.delete(v.id); else n.add(v.id); return n; })} /></td>
                    <td><b>{v.stock_number}</b><small>{v.vin ? v.vin.slice(-8) : "no VIN"}</small></td>
                    <td className="fxInvUnit"><LuxCar className="fxCar" /><div><b>{ymm(v)}</b><small>{[v.trim, v.color, v.body_style].filter(Boolean).join(" · ") || "—"}</small></div></td>
                    <td>{v.mileage !== null ? v.mileage.toLocaleString() : "—"}</td>
                    <td>{money(d.costBasis)}</td>
                    <td><b>{money(v.asking_price_cents)}</b></td>
                    <td className="fxInvGross"><b>{money(d.gross)}</b><small>{pct(d.margin)}</small></td>
                    <td>{d.market ? <><b>{money(d.market.value)}</b><small>{d.market.label} · {pct(d.priceToMarket)}</small></> : <small className="dim">enter KBB / JDP</small>}</td>
                    <td className={d.days >= 60 ? "aged" : ""}>{d.days}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select className={`fxInvStatus s-${v.status}`} value={v.status} onChange={(e) => void quickStatus(v, e.target.value)} aria-label={`Status for ${v.stock_number}`}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                      </select>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}><button className="fxInvX" title="Delete" aria-label={`Delete ${v.stock_number}`} onClick={() => void remove([v.id])}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loaded && !filtered.length && (
            <div className="fxCCEmpty">{inventory.length ? "Nothing matches that search." : "No inventory yet. Import a CSV from your DMS or add a vehicle to get started."}</div>
          )}
        </div>
      </section>

      <section className={`fxCCPanel fxCCHero fxInvDesk ${desk ? "" : "empty"}`}>
        {previewVehicle && draft && desk ? (
          <>
            <div className="fxCCHead">
              <div><b>{adding ? "New vehicle" : ymm(previewVehicle)}</b><small>{adding ? "Fill in what you know — the profit desk updates as you type." : `Stock ${previewVehicle.stock_number} · ${desk.days} days on lot`}</small></div>
              <span className={`fxPill ${desk.gross === null ? "" : desk.gross < 0 ? "amber" : "red"}`}>{desk.gross === null ? "no cost yet" : desk.gross < 0 ? "under water" : `${pct(desk.margin)} margin`}</span>
            </div>

            <div className="fxInvGauges">
              <Gauge label="Gross at asking" value={money(desk.gross)} ratio={desk.margin === null ? 0 : Math.max(0, Math.min(1, desk.margin / 0.25))} hot={desk.gross !== null && desk.gross < 0} />
              <Gauge label="Price vs market" value={pct(desk.priceToMarket)} ratio={desk.priceToMarket === null ? 0 : Math.max(0, Math.min(1, (desk.priceToMarket - 0.8) / 0.4))} hot={desk.priceToMarket !== null && desk.priceToMarket > 1.1} />
              <Gauge label="Room to market" value={money(desk.roomToMarket)} ratio={desk.roomToMarket === null || !desk.market ? 0 : Math.max(0, Math.min(1, desk.roomToMarket / desk.market.value / 0.3))} hot={desk.roomToMarket !== null && desk.roomToMarket < 0} />
            </div>

            <div className="fxInvGrid">
              <fieldset className="fxInvFields">
                <legend>Unit</legend>
                <label>Stock #<input value={draft.stockNumber} onChange={(e) => set("stockNumber", e.target.value)} /></label>
                <label>VIN<input value={draft.vin} onChange={(e) => set("vin", e.target.value.toUpperCase())} maxLength={17} /></label>
                <label>Year<input value={draft.year} onChange={(e) => set("year", e.target.value)} inputMode="numeric" /></label>
                <label>Make<input value={draft.make} onChange={(e) => set("make", e.target.value)} /></label>
                <label>Model<input value={draft.model} onChange={(e) => set("model", e.target.value)} /></label>
                <label>Trim<input value={draft.trim} onChange={(e) => set("trim", e.target.value)} /></label>
                <label>Mileage<input value={draft.mileage} onChange={(e) => set("mileage", e.target.value)} inputMode="numeric" /></label>
                <label>Color<input value={draft.color} onChange={(e) => set("color", e.target.value)} /></label>
                <label>Body<input value={draft.bodyStyle} onChange={(e) => set("bodyStyle", e.target.value)} placeholder="Sedan, SUV…" /></label>
                <label>Drivetrain<input value={draft.drivetrain} onChange={(e) => set("drivetrain", e.target.value)} placeholder="AWD, FWD…" /></label>
                <label>Acquired<input type="date" value={draft.acquiredAt} onChange={(e) => set("acquiredAt", e.target.value)} /></label>
                <label>Status<select value={draft.status} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select></label>
              </fieldset>
              <fieldset className="fxInvFields money">
                <legend>Numbers</legend>
                <label>Acquisition $<input value={draft.acquisitionCost} onChange={(e) => set("acquisitionCost", e.target.value)} inputMode="decimal" placeholder="what you paid" /></label>
                <label>Recon $<input value={draft.reconCost} onChange={(e) => set("reconCost", e.target.value)} inputMode="decimal" placeholder="0" /></label>
                <label className="hot">Asking $<input value={draft.askingPrice} onChange={(e) => set("askingPrice", e.target.value)} inputMode="decimal" /></label>
                <label>KBB $<input value={draft.kbbValue} onChange={(e) => set("kbbValue", e.target.value)} inputMode="decimal" placeholder="from kbb.com" /></label>
                <label>J.D. Power $<input value={draft.jdpowerValue} onChange={(e) => set("jdpowerValue", e.target.value)} inputMode="decimal" placeholder="from jdpower.com" /></label>
                <label>MMR $<input value={draft.mmrValue} onChange={(e) => set("mmrValue", e.target.value)} inputMode="decimal" placeholder="Manheim" /></label>
                <label>Book $<input value={draft.bookValue} onChange={(e) => set("bookValue", e.target.value)} inputMode="decimal" /></label>
                <label className="wide">Notes<input value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Recon done, tires, key count…" /></label>
                <div className="fxInvLinks">
                  <small>Look up the value, then type it in. Live KBB / J.D. Power feeds need a licensed API from those companies and are not connected.</small>
                  <div><a href={kbbUrl} target="_blank" rel="noreferrer">KBB ↗</a><a href={jdpUrl} target="_blank" rel="noreferrer">J.D. Power ↗</a><a href={mmrUrl} target="_blank" rel="noreferrer">MMR ↗</a></div>
                </div>
              </fieldset>
            </div>

            <div className="fxInvLadder">
              <small>PRICE LADDER — what the unit grosses at each price</small>
              <div className="fxCCTable">
                <div className="hd"><span>Price point</span><span>Price</span><span>Gross</span><span>Margin</span></div>
                {desk.ladder.map((l, i) => (
                  <div key={i} className={l.current ? "hot" : ""}><span>{l.label}</span><span>{money(l.price)}</span><span className={l.gross !== null && l.gross < 0 ? "neg" : ""}>{money(l.gross)}</span><span>{pct(l.margin)}</span></div>
                ))}
                {!desk.ladder.length && <div><span>Add an asking price to build the ladder.</span></div>}
              </div>
              <div className="fxInvBasis">
                <span>Acquisition <b>{money(desk.acq)}</b></span><span>+ Recon <b>{money(desk.recon)}</b></span><span>= Cost basis <b>{money(desk.costBasis)}</b></span>
                {desk.market && <span>Market ref <b>{desk.market.label} {money(desk.market.value)}</b></span>}
              </div>
            </div>

            {error && <div className="fxInvError">{error}</div>}
            <div className="fxInvSave">
              {!adding && <button className="fxInvDanger" onClick={() => void remove([selectedId])}>Delete vehicle</button>}
              {adding && <button onClick={() => { setAdding(false); setDraft(null); setSelectedId(inventory[0]?.id || ""); }}>Cancel</button>}
              <button className="fxCCPrimary" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : adding ? "Add to inventory" : "Save changes"}</button>
            </div>
          </>
        ) : (
          <div className="fxCCEmpty">{loaded ? "Select a unit or add a vehicle to open its profit desk." : "Loading inventory…"}</div>
        )}
      </section>

      <div className="fxCCKpis fxInvKpis">
        <article><i>◎</i><div><small>LIVE UNITS</small><b>{kpis.units}</b><span>{inventory.length - kpis.units} sold / wholesaled</span></div></article>
        <article><i>$</i><div><small>COST IN STOCK</small><b>{money(kpis.cost)}</b><span>{kpis.withCost} unit{kpis.withCost === 1 ? "" : "s"} with cost entered</span></div></article>
        <article><i>▲</i><div><small>RETAIL ASKING</small><b>{money(kpis.asking)}</b><span>total list value</span></div></article>
        <article><i>◆</i><div><small>PROJECTED GROSS</small><b>{money(kpis.gross)}</b><span>at asking, units with cost</span></div></article>
        <article><i>◷</i><div><small>AVG DAYS ON LOT</small><b>{kpis.avgDays}</b><span>{kpis.aged} aged 60+ days</span></div></article>
      </div>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onDone={(msg) => { setImportOpen(false); onFlash(msg); void load(); }} />}
    </div>
  );
}

function Gauge({ label, value, ratio, hot }: { label: string; value: string; ratio: number; hot?: boolean }) {
  const len = 220; // approximate arc length for the half-circle path
  return (
    <div className={`fxCCGauge fxInvGauge ${hot ? "hot" : ""}`}>
      <svg viewBox="0 0 150 84"><path className="track" d="M12 78 A63 63 0 0 1 138 78" /><path className="fill" d="M12 78 A63 63 0 0 1 138 78" style={{ strokeDasharray: len, strokeDashoffset: len - len * ratio }} /></svg>
      <b>{value}</b><small>{label.toUpperCase()}</small>
    </div>
  );
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; errors: string[] } | null>(null);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => rowsToImport(parseDelimited(text)), [text]);
  const mapped = parsed.mapping.filter((m) => m.field);
  const unmapped = parsed.mapping.filter((m) => !m.field && m.header);
  const hasKey = mapped.some((m) => m.field === "stockNumber" || m.field === "vin");
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const onFile = (f: File | null) => { if (!f) return; setFileName(f.name); const rd = new FileReader(); rd.onload = () => setText(String(rd.result || "")); rd.readAsText(f); };
  const run = async () => {
    setBusy(true); setErr("");
    const r = await fetch("/api/automotive?resource=inventory-bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: parsed.rows }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(b.error || "Import failed."); return; }
    setResult(b);
    if (!b.errors?.length) onDone(`Imported ${b.inserted} new, updated ${b.updated}`);
  };
  const template = "Stock #,VIN,Year,Make,Model,Trim,Mileage,Color,Asking Price,Acquisition Cost,Recon Cost,KBB,JD Power,MMR,Acquired,Status\nA1234,1HGCV1F34LA000001,2020,Honda,Accord,Sport,41200,Black,21995,17800,650,20450,20100,19200,2026-08-01,AVAILABLE";
  return (
    <div className="fxInvModalBack" onClick={onClose}>
      <div className="fxInvModal" role="dialog" aria-label="Import inventory" onClick={(e) => e.stopPropagation()}>
        <div className="fxCCHead"><div><b>Import inventory</b><small>CSV or Excel export from your DMS, or paste rows straight from a spreadsheet. Matching stock numbers are updated, new ones are added.</small></div><button className="fxInvX" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="fxInvDrop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0] || null); }}>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0] || null)} />
          <button className="fxCCPrimary" onClick={() => fileRef.current?.click()}>Choose CSV file</button>
          <span>{fileName || "or drop a file here"}</span>
          <button className="fxCCMini" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([template], { type: "text/csv" })); a.download = "cyncro-inventory-template.csv"; a.click(); }}>Download template</button>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"Or paste rows here (first row = headers):\n" + template} rows={7} aria-label="Paste rows" />
        {parsed.mapping.length > 0 && (
          <div className="fxInvMap">
            <small>COLUMN MAPPING</small>
            <div>
              {mapped.map((m, i) => <span key={i} className="ok">{m.header} → {FIELD_LABEL[m.field!]}</span>)}
              {unmapped.map((m, i) => <span key={`u${i}`} className="skip" title="Not recognised — this column will be skipped">{m.header} → skipped</span>)}
            </div>
            {!hasKey && <em>Need a Stock # or VIN column to import.</em>}
          </div>
        )}
        {parsed.rows.length > 0 && (
          <div className="fxInvPreview">
            <small>PREVIEW · {parsed.rows.length} rows</small>
            <div className="fxInvTableWrap"><table className="fxInvTable mini"><thead><tr>{mapped.map((m) => <th key={m.field}>{FIELD_LABEL[m.field!]}</th>)}</tr></thead>
              <tbody>{parsed.rows.slice(0, 6).map((r, i) => <tr key={i}>{mapped.map((m) => <td key={m.field}>{r[m.field!] || ""}</td>)}</tr>)}</tbody></table></div>
            {parsed.rows.length > 6 && <em>…and {parsed.rows.length - 6} more</em>}
          </div>
        )}
        {result && (
          <div className="fxInvResult"><b>Imported {result.inserted} new · updated {result.updated}</b>{result.errors.length > 0 && <ul>{result.errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}</ul>}</div>
        )}
        {err && <div className="fxInvError">{err}</div>}
        <div className="fxInvSave">
          <button onClick={onClose}>{result ? "Done" : "Cancel"}</button>
          <button className="fxCCPrimary" disabled={busy || !parsed.rows.length || !hasKey} onClick={() => void run()}>{busy ? "Importing…" : `Import ${parsed.rows.length || ""} vehicles`}</button>
        </div>
      </div>
    </div>
  );
}
