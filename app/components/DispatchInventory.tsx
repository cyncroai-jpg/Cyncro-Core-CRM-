"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type StockItem = {
  id: string; name: string; category: string | null; brand: string | null; size: string | null; sku: string | null;
  quantity: number; unit: string | null; min_quantity: number | null; unit_cost_cents: number | null; location: string | null;
  condition: string | null; notes: string | null; source: string; scan_confidence: string | null; created_at: string; updated_at: string;
};
export type StockSummary = { count: number; low: number; valueCents: number; lastScan: string | null; scanEnabled: boolean };
type ScanItem = { name: string; category: string; quantity: number; unit: string; brand: string; size: string; condition: string; confidence: "high" | "medium" | "low"; notes: string };
type ScanRow = ScanItem & { key: number; keep: boolean };

const CATEGORIES = ["PARTS", "MATERIALS", "TOOLS", "CONSUMABLES", "SAFETY", "EQUIPMENT", "OTHER"];
const LOCATIONS = ["TRUCK", "WAREHOUSE", "SHOP", "JOB_SITE", "OTHER"];
const label = (s: string | null) => (s || "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const money = (c: number | null | undefined) => (c === null || c === undefined ? "—" : `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const isLow = (i: StockItem) => i.min_quantity !== null && Number(i.quantity) <= Number(i.min_quantity);

/** Downscale a photo in the browser so uploads stay small and fast. Returns base64 JPEG (no data: prefix). */
export function shrinkImage(file: File, maxEdge = 1600): Promise<{ data: string; mediaType: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale)); const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("canvas unavailable")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
      URL.revokeObjectURL(url);
      resolve({ data: dataUrl.split(",")[1] || "", mediaType: "image/jpeg", width: w, height: h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file is not an image we can read.")); };
    img.src = url;
  });
}

export function DispatchInventory({ onFlash }: { onFlash: (m: string) => void }) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("ALL");
  const [loc, setLoc] = useState("ALL");
  const [lowOnly, setLowOnly] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  // Scanner state
  const [preview, setPreview] = useState("");
  const [photo, setPhoto] = useState<{ data: string; mediaType: string; name: string } | null>(null);
  const [scanLoc, setScanLoc] = useState("TRUCK");
  const [hint, setHint] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanRows, setScanRows] = useState<ScanRow[]>([]);
  const [scanSummary, setScanSummary] = useState("");
  const [scanError, setScanError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const load = () => fetch("/api/dispatch/inventory").then((r) => r.json()).then((d: { items?: StockItem[]; summary?: StockSummary }) => { setItems(d.items || []); setSummary(d.summary || null); setLoaded(true); });
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => (cat === "ALL" || (i.category || "OTHER") === cat) && (loc === "ALL" || (i.location || "") === loc) && (!lowOnly || isLow(i)) &&
      (!needle || [i.name, i.brand, i.size, i.sku, i.notes].join(" ").toLowerCase().includes(needle)));
  }, [items, q, cat, loc, lowOnly]);

  const pickFile = async (f: File | null) => {
    if (!f) return;
    setScanError(""); setScanRows([]); setScanSummary("");
    try {
      const shrunk = await shrinkImage(f);
      setPhoto({ data: shrunk.data, mediaType: shrunk.mediaType, name: f.name });
      setPreview(`data:${shrunk.mediaType};base64,${shrunk.data}`);
    } catch (e) { setScanError((e as Error).message); }
  };
  const analyze = async () => {
    if (!photo) return;
    setScanning(true); setScanError(""); setScanRows([]);
    const r = await fetch("/api/dispatch/inventory?action=scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: photo.data, mediaType: photo.mediaType, hint }) });
    const b = await r.json().catch(() => ({}));
    setScanning(false);
    if (!r.ok) { setScanError(b.error || "Could not analyze the photo."); return; }
    const rows: ScanRow[] = (b.items || []).map((it: ScanItem, i: number) => ({ ...it, key: i, keep: true }));
    setScanRows(rows); setScanSummary(b.summary || "");
    if (!rows.length) setScanError("No items were recognised. Try a closer, brighter photo with labels facing the camera.");
  };
  const setRow = (key: number, patch: Partial<ScanRow>) => setScanRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const commitScan = async () => {
    const keep = scanRows.filter((r) => r.keep && r.name.trim());
    if (!keep.length) return;
    setSaving(true);
    const r = await fetch("/api/dispatch/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "SCAN", merge: true, items: keep.map((k) => ({ ...k, location: scanLoc })) }) });
    const b = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setScanError(b.error || "Could not save items."); return; }
    onFlash(`${b.inserted} added${b.merged ? `, ${b.merged} topped up` : ""} · dashboard updated`);
    setScanRows([]); setScanSummary(""); setPhoto(null); setPreview(""); setHint("");
    await load();
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    const r = await fetch(`/api/dispatch/inventory?id=${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { const b = await r.json().catch(() => ({})); setError(b.error || "Could not save."); return false; }
    return true;
  };
  const bump = async (i: StockItem, delta: number) => {
    const next = Math.max(0, Number(i.quantity) + delta);
    setItems((list) => list.map((x) => (x.id === i.id ? { ...x, quantity: next } : x)));
    if (await patch(i.id, { quantity: next })) void load();
  };
  const remove = async (ids: string[]) => {
    if (!ids.length) return;
    if (!window.confirm(ids.length === 1 ? "Remove this item from inventory?" : `Remove ${ids.length} items from inventory?`)) return;
    const r = await fetch(`/api/dispatch/inventory?ids=${ids.join(",")}`, { method: "DELETE" });
    if (!r.ok) { setError("Could not delete."); return; }
    onFlash(ids.length === 1 ? "Item removed" : `${ids.length} items removed`); setChecked(new Set()); await load();
  };
  const saveEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(["name", "category", "brand", "size", "sku", "quantity", "unit", "minQuantity", "unitCost", "location", "condition", "notes"].map((k) => [k, String(f.get(k) ?? "")]));
    setSaving(true); setError("");
    const r = editing
      ? await fetch(`/api/dispatch/inventory?id=${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch("/api/dispatch/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, merge: false }) });
    const b = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setError(b.error || "Could not save item."); return; }
    onFlash(editing ? "Item saved" : "Item added"); setEditing(null); setAdding(false); await load();
  };
  const exportCsv = () => {
    const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ["Name", "Category", "Brand", "Size", "SKU", "Quantity", "Unit", "Min Qty", "Unit Cost", "Location", "Condition", "Notes", "Source"];
    const lines = filtered.map((i) => [i.name, i.category, i.brand, i.size, i.sku, i.quantity, i.unit, i.min_quantity, i.unit_cost_cents === null ? "" : i.unit_cost_cents / 100, i.location, i.condition, i.notes, i.source].map(esc).join(","));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" })); a.download = `dispatch-inventory-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const toggleAll = () => setChecked((c) => (c.size === filtered.length ? new Set() : new Set(filtered.map((i) => i.id))));
  const lowCount = items.filter(isLow).length;

  return (
    <div className="dxInv">
      <div className="dxCCTop">
        <div className="dxCCDate"><b>Stock &amp; inventory</b><small>{items.length} items tracked · {lowCount} low · snap a photo of a shelf or truck and the AI counts it in</small></div>
        <div className="fxInvSearch">
          <input placeholder="Search parts, tools, materials…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inventory" />
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="ALL">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
          <select value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Location"><option value="ALL">All locations</option>{LOCATIONS.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
          <label className="fxLendToggle"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock</label>
        </div>
        <div className="fxCCActions">
          {checked.size > 0 && <button className="fxInvDanger" onClick={() => void remove([...checked])}>Delete {checked.size} selected</button>}
          <button onClick={exportCsv} disabled={!filtered.length}>Export CSV</button>
          <button className="fxCCPrimary" onClick={() => { setEditing(null); setAdding(true); setError(""); }}>+ Add item</button>
        </div>
      </div>

      <section className="fxCCPanel fxCCHero dxInvScan">
        <div className="fxCCHead"><div><b>Photo count</b><small>Upload or take a photo of your stock. The AI identifies each item and counts it, you confirm, and it lands on the dashboard.</small></div>
          {summary && !summary.scanEnabled && <span className="fxPill amber">AI key not set</span>}
          {summary?.scanEnabled && <span className="fxCCLive"><i />AI READY</span>}
        </div>
        {summary && !summary.scanEnabled && (
          <div className="dxInvNotice">Photo analysis needs an Anthropic API key on the deployment. Run <code>npx wrangler secret put ANTHROPIC_API_KEY</code> once and redeploy. Manual entry below works either way.</div>
        )}
        <div className="dxInvScanGrid">
          <div className="dxInvDrop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pickFile(e.dataTransfer.files?.[0] || null); }}>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickFile(e.target.files?.[0] || null)} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void pickFile(e.target.files?.[0] || null)} />
            {preview ? (
              <img src={preview} alt="Stock photo to analyze" />
            ) : (
              <div className="dxInvDropEmpty"><b>Drop a photo here</b><small>Shelves, truck bins, pallets, a tool bag. Labels facing the camera count best.</small></div>
            )}
            <div className="dxInvDropBtns">
              <button className="fxCCPrimary" onClick={() => fileRef.current?.click()}>Choose photo</button>
              <button onClick={() => cameraRef.current?.click()}>Take photo</button>
              {preview && <button onClick={() => { setPhoto(null); setPreview(""); setScanRows([]); setScanSummary(""); setScanError(""); }}>Clear</button>}
            </div>
          </div>
          <div className="dxInvScanSide">
            <label>Where is this stock?<select value={scanLoc} onChange={(e) => setScanLoc(e.target.value)}>{LOCATIONS.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select></label>
            <label>Anything the AI should know? <span>optional</span><input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="e.g. HVAC truck, top shelf is all 3/4in fittings" /></label>
            <button className="fxCCPrimary dxInvAnalyze" disabled={!photo || scanning || (summary ? !summary.scanEnabled : false)} onClick={() => void analyze()}>{scanning ? "Analyzing photo…" : "Analyze photo"}</button>
            <small>Counts are the AI&apos;s best read of the photo. Check anything marked low confidence before you add it. Items with the same name in the same location are topped up, not duplicated.</small>
          </div>
        </div>
        {scanError && <div className="fxInvError">{scanError}</div>}
        {scanRows.length > 0 && (
          <div className="dxInvResults">
            <div className="fxCCHead"><div><b>{scanRows.filter((r) => r.keep).length} of {scanRows.length} items to add</b><small>{scanSummary}</small></div><button className="fxCCMini" onClick={() => setScanRows((rs) => rs.map((r) => ({ ...r, keep: !rs.every((x) => x.keep) })))}>Toggle all</button></div>
            <div className="fxInvTableWrap">
              <table className="fxInvTable dxInvTable">
                <thead><tr><th /><th>Item</th><th>Category</th><th>Qty</th><th>Unit</th><th>Brand / size</th><th>Confidence</th><th>Notes</th></tr></thead>
                <tbody>
                  {scanRows.map((r) => (
                    <tr key={r.key} className={r.keep ? "" : "off"}>
                      <td><input type="checkbox" checked={r.keep} onChange={(e) => setRow(r.key, { keep: e.target.checked })} aria-label={`Keep ${r.name}`} /></td>
                      <td><input className="dxInvCell" value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} /></td>
                      <td><select className="dxInvCell" value={r.category} onChange={(e) => setRow(r.key, { category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select></td>
                      <td><input className="dxInvCell num" value={r.quantity} inputMode="decimal" onChange={(e) => setRow(r.key, { quantity: Number(e.target.value) || 0 })} /></td>
                      <td><input className="dxInvCell sm" value={r.unit} onChange={(e) => setRow(r.key, { unit: e.target.value })} /></td>
                      <td><small>{[r.brand, r.size].filter(Boolean).join(" · ") || "—"}</small></td>
                      <td><span className={`fxPill ${r.confidence === "high" ? "green" : r.confidence === "low" ? "amber" : ""}`}>{r.confidence}</span></td>
                      <td><small>{r.notes || ""}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="fxInvSave"><button onClick={() => setScanRows([])}>Discard</button><button className="fxCCPrimary" disabled={saving || !scanRows.some((r) => r.keep)} onClick={() => void commitScan()}>{saving ? "Adding…" : `Add ${scanRows.filter((r) => r.keep).length} items to inventory`}</button></div>
          </div>
        )}
      </section>

      {(adding || editing) && (
        <form className="fxCCPanel dxInvForm" onSubmit={(e) => void saveEdit(e)} key={editing?.id || "new"}>
          <div className="fxCCHead"><div><b>{editing ? `Edit ${editing.name}` : "Add item"}</b><small>Set a minimum quantity to get a low-stock flag on the dashboard.</small></div></div>
          <div className="fxInvFields">
            <label className="wide">Name<input name="name" required defaultValue={editing?.name || ""} placeholder="PVC elbow 3/4in" /></label>
            <label>Category<select name="category" defaultValue={editing?.category || "PARTS"}>{CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select></label>
            <label>Location<select name="location" defaultValue={editing?.location || "TRUCK"}>{LOCATIONS.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select></label>
            <label>Quantity<input name="quantity" inputMode="decimal" defaultValue={editing ? String(editing.quantity) : "1"} /></label>
            <label>Unit<input name="unit" defaultValue={editing?.unit || "each"} /></label>
            <label>Min qty<input name="minQuantity" inputMode="decimal" defaultValue={editing?.min_quantity ?? ""} placeholder="reorder at" /></label>
            <label>Unit cost $<input name="unitCost" inputMode="decimal" defaultValue={editing?.unit_cost_cents !== null && editing?.unit_cost_cents !== undefined ? String(editing.unit_cost_cents / 100) : ""} /></label>
            <label>Brand<input name="brand" defaultValue={editing?.brand || ""} /></label>
            <label>Size / spec<input name="size" defaultValue={editing?.size || ""} /></label>
            <label>SKU<input name="sku" defaultValue={editing?.sku || ""} /></label>
            <label>Condition<input name="condition" defaultValue={editing?.condition || ""} placeholder="new, used…" /></label>
            <label className="wide">Notes<input name="notes" defaultValue={editing?.notes || ""} /></label>
          </div>
          {error && <div className="fxInvError">{error}</div>}
          <div className="fxInvSave"><button type="button" onClick={() => { setEditing(null); setAdding(false); }}>Cancel</button><button className="fxCCPrimary" type="submit" disabled={saving}>{editing ? "Save item" : "Add item"}</button></div>
        </form>
      )}

      <section className="fxCCPanel">
        <div className="fxCCHead"><div><b>On hand</b><small>{filtered.length} shown · tap the +/− to adjust counts on the spot</small></div></div>
        <div className="fxInvTableWrap">
          <table className="fxInvTable dxInvTable">
            <thead><tr>
              <th><input type="checkbox" aria-label="Select all" checked={filtered.length > 0 && checked.size === filtered.length} onChange={toggleAll} /></th>
              <th>Item</th><th>Category</th><th>Location</th><th>On hand</th><th>Min</th><th>Unit cost</th><th>Source</th><th /></tr></thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className={isLow(i) ? "low" : ""}>
                  <td><input type="checkbox" aria-label={`Select ${i.name}`} checked={checked.has(i.id)} onChange={() => setChecked((c) => { const n = new Set(c); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} /></td>
                  <td><b>{i.name}</b><small>{[i.brand, i.size, i.sku].filter(Boolean).join(" · ") || (i.notes ? i.notes.slice(0, 60) : "—")}</small></td>
                  <td><span className="fxPill">{label(i.category || "OTHER")}</span></td>
                  <td>{i.location ? label(i.location) : "—"}</td>
                  <td className="dxInvQty"><button aria-label={`Decrease ${i.name}`} onClick={() => void bump(i, -1)}>−</button><b>{Number(i.quantity).toLocaleString()}</b><small>{i.unit || "each"}</small><button aria-label={`Increase ${i.name}`} onClick={() => void bump(i, 1)}>+</button>{isLow(i) && <span className="fxPill amber">low</span>}</td>
                  <td>{i.min_quantity ?? "—"}</td>
                  <td>{money(i.unit_cost_cents)}</td>
                  <td><small>{i.source === "SCAN" ? `photo · ${i.scan_confidence || "—"}` : "manual"}</small></td>
                  <td><button className="fxCCMini" onClick={() => { setAdding(false); setEditing(i); setError(""); }}>Edit</button> <button className="fxInvX" aria-label={`Delete ${i.name}`} onClick={() => void remove([i.id])}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {loaded && !filtered.length && <div className="fxCCEmpty">{items.length ? "Nothing matches that filter." : "No stock tracked yet. Take a photo of a shelf above, or add an item by hand."}</div>}
        </div>
      </section>

      <div className="fxCCKpis fxInvKpis">
        <article><i>▦</i><div><small>ITEMS TRACKED</small><b>{summary?.count ?? items.length}</b><span>{items.filter((i) => i.source === "SCAN").length} from photos</span></div></article>
        <article><i>!</i><div><small>LOW STOCK</small><b>{lowCount}</b><span>at or below minimum</span></div></article>
        <article><i>$</i><div><small>STOCK VALUE</small><b>{money(summary?.valueCents ?? 0)}</b><span>items with a unit cost</span></div></article>
        <article><i>◎</i><div><small>ON TRUCKS</small><b>{items.filter((i) => i.location === "TRUCK").length}</b><span>{items.filter((i) => i.location === "WAREHOUSE").length} in warehouse</span></div></article>
        <article><i>◷</i><div><small>LAST PHOTO COUNT</small><b>{summary?.lastScan ? new Date(summary.lastScan).toLocaleDateString([], { month: "short", day: "numeric" }) : "—"}</b><span>{summary?.scanEnabled ? "AI analysis on" : "AI key not set"}</span></div></article>
      </div>
    </div>
  );
}
