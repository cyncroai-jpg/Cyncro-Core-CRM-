"use client";
import { useEffect, useMemo, useState } from "react";

/** One row from `GET /api/dispatch/jobs?summary=1`. */
export type WorkOrderRow = {
  id: string; customer_id: string; customer_name: string | null; customer_phone: string | null; service_type: string; description: string | null;
  address: string; scheduled_at: string; status: string; assigned_tech_id: string | null; tech_name: string | null; revenue_cents: number;
  estimated_minutes: number | null; lat: number | null; lng: number | null; created_at: string; updated_at: string;
  notes_count: number; materials_count: number; materials_cents: number; labor_minutes: number; open_clocks: number;
  invoice_status: string | null; invoice_cents: number | null; invoice_id: string | null;
};
type Note = { id: string; author: string | null; body: string; created_at: string };
type Material = { id: string; name: string; quantity: number; unit_cost_cents: number };
type TimeEntry = { id: string; tech_id: string | null; clock_in_at: string; clock_out_at: string | null };
type Detail = { job: WorkOrderRow; notes: Note[]; materials: Material[]; time: TimeEntry[]; invoice: { id: string; status: string; amount_cents: number } | null };

const LIFECYCLE = ["BOOKED", "ASSIGNED", "IN PROGRESS", "COMPLETE", "INVOICED"];
const money = (c: number | null | undefined) => `$${Math.round((c || 0) / 100).toLocaleString()}`;
const money2 = (c: number) => (c % 100 === 0 ? money(c) : `$${(c / 100).toFixed(2)}`);
const hm = (min: number) => { const m = Math.round(min); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`; };
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.valueOf()) ? "—" : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };
const woNumber = (j: WorkOrderRow) => `WO-${j.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

/** Readiness = the six things a billable work order needs. Each is a real check, nothing is assumed. */
export function readiness(j: WorkOrderRow) {
  const checks = [
    { key: "scope", label: "Scope written", ok: Boolean(j.description && j.description.trim().length > 0), hint: "Add a description of the work" },
    { key: "tech", label: "Technician assigned", ok: Boolean(j.assigned_tech_id), hint: "Assign a tech" },
    { key: "labor", label: "Labor logged", ok: Number(j.labor_minutes) > 0, hint: "Clock in on the job" },
    { key: "materials", label: "Materials recorded", ok: Number(j.materials_count) > 0, hint: "Add parts used, or none" },
    { key: "notes", label: "Field notes", ok: Number(j.notes_count) > 0, hint: "Add a note from the site" },
    { key: "done", label: "Marked complete", ok: ["COMPLETE", "INVOICED"].includes(j.status), hint: "Mark complete when finished" },
  ];
  const done = checks.filter((c) => c.ok).length;
  const billed = j.invoice_status === "PAID" ? "PAID" : j.invoice_status ? "INVOICED" : j.status === "COMPLETE" ? "READY" : "NOT_READY";
  return { checks, done, total: checks.length, pct: Math.round((done / checks.length) * 100), billed };
}

export function DispatchWorkOrders({ onFlash, onViewJob, onNew, refreshKey = 0 }: { onFlash: (m: string) => void; onViewJob: (jobId: string) => void; onNew: () => void; refreshKey?: number }) {
  const [rows, setRows] = useState<WorkOrderRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "ACTION" | "READY" | "BILLED">("ALL");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [note, setNote] = useState("");
  const [mat, setMat] = useState({ name: "", qty: "1", cost: "" });
  const [busy, setBusy] = useState("");

  const load = () => fetch("/api/dispatch/jobs?summary=1").then((r) => r.json()).then((d: { jobs?: WorkOrderRow[] }) => { setRows(d.jobs || []); setLoaded(true); });
  useEffect(() => { void load(); }, [refreshKey]);
  const loadDetail = (id: string) => fetch(`/api/dispatch/jobs?id=${id}`).then((r) => (r.ok ? r.json() : null)).then((d: Detail | null) => setDetail(d));
  useEffect(() => { if (selectedId) void loadDetail(selectedId); else setDetail(null); }, [selectedId]);
  useEffect(() => { if (!selectedId && rows.length) setSelectedId(rows[0].id); }, [rows, selectedId]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((j) => {
      const r = readiness(j);
      const open = !["COMPLETE", "INVOICED", "CANCELLED"].includes(j.status);
      if (filter === "OPEN" && !open) return false;
      if (filter === "ACTION" && (!open || r.done >= r.total - 1)) return false;
      if (filter === "READY" && r.billed !== "READY") return false;
      if (filter === "BILLED" && !["INVOICED", "PAID"].includes(r.billed)) return false;
      return !needle || [woNumber(j), j.customer_name, j.service_type, j.address, j.tech_name].join(" ").toLowerCase().includes(needle);
    });
  }, [rows, q, filter]);

  const selected = rows.find((r) => r.id === selectedId) || null;
  const sel = selected ? readiness(selected) : null;
  const kpis = useMemo(() => {
    const open = rows.filter((j) => !["COMPLETE", "INVOICED", "CANCELLED"].includes(j.status));
    const ready = rows.filter((j) => readiness(j).billed === "READY");
    const invoiced = rows.filter((j) => j.invoice_status && j.invoice_status !== "PAID");
    const paid = rows.filter((j) => j.invoice_status === "PAID");
    return { open: open.length, action: open.filter((j) => readiness(j).done < 5).length, ready: ready.length, readyCents: ready.reduce((s, j) => s + Number(j.revenue_cents || 0), 0), invoicedCents: invoiced.reduce((s, j) => s + Number(j.invoice_cents || 0), 0), paidCents: paid.reduce((s, j) => s + Number(j.invoice_cents || 0), 0), labor: rows.reduce((s, j) => s + Number(j.labor_minutes || 0), 0) };
  }, [rows]);

  const patch = async (body: Record<string, unknown>, msg: string) => {
    setBusy(msg);
    const r = await fetch("/api/dispatch/jobs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selectedId, ...body }) });
    setBusy("");
    if (!r.ok) { const b = await r.json().catch(() => ({})); onFlash(b.error || "Could not update"); return; }
    onFlash(msg); await load(); await loadDetail(selectedId);
  };
  const addNote = async () => {
    if (!note.trim() || !selectedId) return;
    setBusy("note");
    const r = await fetch("/api/dispatch/jobs/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: selectedId, body: note }) });
    setBusy("");
    if (!r.ok) { onFlash("Could not add note"); return; }
    setNote(""); onFlash("Note added"); await load(); await loadDetail(selectedId);
  };
  const addMaterial = async () => {
    if (!mat.name.trim() || !selectedId) return;
    setBusy("mat");
    const r = await fetch("/api/dispatch/materials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: selectedId, name: mat.name, quantity: Number(mat.qty) || 1, unitCost: Number(mat.cost) || 0 }) });
    setBusy("");
    if (!r.ok) { onFlash("Could not add material"); return; }
    setMat({ name: "", qty: "1", cost: "" }); onFlash("Material added"); await load(); await loadDetail(selectedId);
  };
  const removeMaterial = async (id: string) => {
    await fetch(`/api/dispatch/materials?id=${id}`, { method: "DELETE" }); await load(); await loadDetail(selectedId);
  };
  const clock = async () => {
    if (!selectedId) return;
    setBusy("clock");
    const r = await fetch("/api/dispatch/jobs/time", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: selectedId, techId: selected?.assigned_tech_id || undefined }) });
    setBusy("");
    if (!r.ok) { onFlash("Could not update the clock"); return; }
    onFlash(selected && Number(selected.open_clocks) > 0 ? "Clocked out" : "Clocked in"); await load(); await loadDetail(selectedId);
  };
  const invoice = async () => {
    if (!selectedId) return;
    setBusy("invoice");
    const r = await fetch("/api/dispatch/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: selectedId }) });
    setBusy("");
    if (!r.ok) { const b = await r.json().catch(() => ({})); onFlash(b.error || "Could not create invoice"); return; }
    onFlash("Invoice created"); await load(); await loadDetail(selectedId);
  };
  const markPaid = async () => {
    if (!selected?.invoice_id) return;
    setBusy("paid");
    const r = await fetch("/api/dispatch/invoices", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.invoice_id, markPaid: true }) });
    setBusy("");
    if (!r.ok) { onFlash("Could not mark paid"); return; }
    onFlash("Marked paid"); await load(); await loadDetail(selectedId);
  };
  const stageIndex = selected ? LIFECYCLE.indexOf(selected.status) : -1;
  const nextStatus = stageIndex >= 0 && stageIndex < 3 ? LIFECYCLE[stageIndex + 1] : null;

  return (
    <div className="dxWO">
      <div className="dxCCTop">
        <div className="dxCCDate"><b>Work orders</b><small>{rows.length} on file · {kpis.action} need action · {kpis.ready} ready to invoice</small></div>
        <div className="fxInvSearch">
          <input placeholder="Search WO #, customer, service, tech…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search work orders" />
        </div>
        <div className="fxLendChips dxWOChips">
          {([["ALL", "All"], ["OPEN", "Open"], ["ACTION", "Needs action"], ["READY", "Ready to invoice"], ["BILLED", "Invoiced"]] as const).map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <div className="fxCCActions"><button className="fxCCPrimary" onClick={onNew}>+ Work order</button></div>
      </div>

      <section className="fxCCPanel dxWOList">
        <div className="fxCCHead"><div><b>Records</b><small>{list.length} shown · readiness is computed from real notes, labor, materials and invoices</small></div><span className="fxCCLive"><i />LIVE</span></div>
        <div className="dxWORows">
          {list.map((j) => {
            const r = readiness(j);
            const tone = r.billed === "PAID" ? "green" : r.billed === "INVOICED" ? "blue" : r.billed === "READY" ? "red" : "";
            return (
              <button key={j.id} className={`dxWORow ${j.id === selectedId ? "sel" : ""}`} onClick={() => setSelectedId(j.id)}>
                <span className="dxWOId"><b>{woNumber(j)}</b><small>{when(j.scheduled_at)}</small></span>
                <span className="dxWOWho"><b>{j.customer_name || "Unknown customer"}</b><small>{j.service_type}{j.tech_name ? ` · ${j.tech_name}` : " · unassigned"}</small></span>
                <span className="dxWOMeter"><i><b style={{ width: `${r.pct}%` }} /></i><small>{r.done}/{r.total} documented</small></span>
                <span className="dxWOLabor"><b>{Number(j.labor_minutes) > 0 ? hm(Number(j.labor_minutes)) : "—"}</b><small>{Number(j.open_clocks) > 0 ? "on the clock" : "labor"}</small></span>
                <span className="dxWOMoney"><b>{money(j.revenue_cents)}</b><small>{j.materials_count ? `${j.materials_count} parts · ${money(j.materials_cents)}` : "no parts"}</small></span>
                <em className={`fxPill ${tone}`}>{r.billed === "NOT_READY" ? j.status.toLowerCase() : r.billed.toLowerCase()}</em>
              </button>
            );
          })}
          {loaded && !list.length && <div className="fxCCEmpty">{rows.length ? "No work orders match that filter." : "No work orders yet. Create a job and it becomes a work order."}</div>}
        </div>
      </section>

      <aside className={`fxCCPanel fxCCHero dxWODesk ${selected ? "" : "empty"}`}>
        {selected && sel ? (
          <>
            <div className="fxCCHead">
              <div><b>{woNumber(selected)} · {selected.customer_name || "Unknown"}</b><small>{selected.service_type} · {selected.address}</small></div>
              <button className="fxCCMini" onClick={() => onViewJob(selected.id)}>Open job</button>
            </div>

            <div className="dxWOStages">
              {LIFECYCLE.map((s, i) => (
                <span key={s} className={i < stageIndex ? "done" : i === stageIndex ? "now" : ""}><i>{i < stageIndex ? "✓" : i + 1}</i><small>{s.toLowerCase()}</small></span>
              ))}
            </div>

            <div className="dxWOGrid">
              <div className="dxWOChecks">
                <small>READINESS · {sel.done}/{sel.total}</small>
                {sel.checks.map((c) => (
                  <span key={c.key} className={c.ok ? "ok" : ""}><i>{c.ok ? "✓" : "·"}</i><b>{c.label}</b>{!c.ok && <em>{c.hint}</em>}</span>
                ))}
              </div>
              <div className="dxWOFacts">
                <small>NUMBERS</small>
                <div><span>Scheduled</span><b>{when(selected.scheduled_at)}</b></div>
                <div><span>Technician</span><b>{selected.tech_name || "Unassigned"}</b></div>
                <div><span>Estimate</span><b>{selected.estimated_minutes ? hm(selected.estimated_minutes) : "—"}</b></div>
                <div><span>Labor logged</span><b>{Number(selected.labor_minutes) > 0 ? hm(Number(selected.labor_minutes)) : "—"}</b></div>
                <div><span>Materials</span><b>{money(selected.materials_cents)}</b></div>
                <div><span>Job value</span><b>{money(selected.revenue_cents)}</b></div>
                <div className="hot"><span>Gross after parts</span><b>{money(Number(selected.revenue_cents) - Number(selected.materials_cents))}</b></div>
                <div><span>Invoice</span><b>{selected.invoice_status ? `${selected.invoice_status.toLowerCase()} · ${money(selected.invoice_cents)}` : "not issued"}</b></div>
              </div>
            </div>

            <div className="dxWOActions">
              {nextStatus && <button className="fxCCPrimary" disabled={!!busy} onClick={() => void patch({ status: nextStatus }, `Moved to ${nextStatus.toLowerCase()}`)}>Mark {nextStatus.toLowerCase()}</button>}
              {!["COMPLETE", "INVOICED", "CANCELLED"].includes(selected.status) && <button disabled={!!busy} onClick={() => void clock()}>{Number(selected.open_clocks) > 0 ? "Clock out" : "Clock in"}</button>}
              {sel.billed === "READY" && <button className="fxCCPrimary" disabled={!!busy} onClick={() => void invoice()}>Create invoice</button>}
              {sel.billed === "INVOICED" && <button disabled={!!busy} onClick={() => void markPaid()}>Mark paid</button>}
              {selected.customer_phone && <a className="dxWOCall" href={`tel:${selected.customer_phone}`}>Call customer</a>}
            </div>

            <div className="dxWOLower">
              <div>
                <small>FIELD NOTES · {detail?.notes.length ?? selected.notes_count}</small>
                <div className="dxWOAdd"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened on site…" onKeyDown={(e) => { if (e.key === "Enter") void addNote(); }} /><button className="fxCCMini" disabled={busy === "note" || !note.trim()} onClick={() => void addNote()}>Add</button></div>
                <ul className="dxWOFeed notes">
                  {(detail?.notes || []).slice(0, 6).map((n) => <li key={n.id}><b>{n.author || "Team"}</b><span>{n.body}</span><small>{when(n.created_at)}</small></li>)}
                  {detail && !detail.notes.length && <li className="dim">No notes yet.</li>}
                </ul>
              </div>
              <div>
                <small>MATERIALS · {money(selected.materials_cents)}</small>
                <div className="dxWOAdd three"><input value={mat.name} onChange={(e) => setMat({ ...mat, name: e.target.value })} placeholder="Part or material" /><input value={mat.qty} onChange={(e) => setMat({ ...mat, qty: e.target.value })} inputMode="decimal" aria-label="Quantity" /><input value={mat.cost} onChange={(e) => setMat({ ...mat, cost: e.target.value })} inputMode="decimal" placeholder="$ each" aria-label="Unit cost" /><button className="fxCCMini" disabled={busy === "mat" || !mat.name.trim()} onClick={() => void addMaterial()}>Add</button></div>
                <ul className="dxWOFeed">
                  {(detail?.materials || []).map((m) => <li key={m.id}><b>{m.name}</b><span>{m.quantity} × {money2(m.unit_cost_cents)}</span><small>{money(m.quantity * m.unit_cost_cents)}</small><button className="fxInvX" aria-label={`Remove ${m.name}`} onClick={() => void removeMaterial(m.id)}>✕</button></li>)}
                  {detail && !detail.materials.length && <li className="dim">No materials recorded.</li>}
                </ul>
                {detail && detail.time.length > 0 && (
                  <>
                    <small>TIME ENTRIES</small>
                    <ul className="dxWOFeed">
                      {detail.time.slice(0, 4).map((t) => <li key={t.id}><b>{when(t.clock_in_at)}</b><span>{t.clock_out_at ? `→ ${when(t.clock_out_at)}` : "still on the clock"}</span><small>{t.clock_out_at ? hm((new Date(t.clock_out_at).valueOf() - new Date(t.clock_in_at).valueOf()) / 60000) : ""}</small></li>)}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="fxCCEmpty">{loaded ? "Select a work order to open its record." : "Loading work orders…"}</div>
        )}
      </aside>

      <div className="fxCCKpis fxInvKpis dxWOKpis">
        <article><i>▤</i><div><small>OPEN</small><b>{kpis.open}</b><span>{kpis.action} need action</span></div></article>
        <article><i>✓</i><div><small>READY TO INVOICE</small><b>{kpis.ready}</b><span>{money(kpis.readyCents)} waiting</span></div></article>
        <article><i>$</i><div><small>INVOICED</small><b>{money(kpis.invoicedCents)}</b><span>outstanding</span></div></article>
        <article><i>◆</i><div><small>COLLECTED</small><b>{money(kpis.paidCents)}</b><span>paid invoices</span></div></article>
        <article><i>◷</i><div><small>LABOR LOGGED</small><b>{hm(kpis.labor)}</b><span>across all work orders</span></div></article>
      </div>
    </div>
  );
}
