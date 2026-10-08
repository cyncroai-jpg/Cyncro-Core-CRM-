"use client";
import { useEffect, useState } from "react";

type Client = { id: string; name: string; slug: string; plan: string; active: number; created_at: string; owner_email: string | null; owner_name: string | null; owner_pending: boolean; users: number; contacts: number; deals: number; bookings_week: number; overdue_invoices: number; last_activity: string | null };
type Data = { isAgency: boolean; canManage: boolean; role: string; clients: Client[]; branding: { brandName: string; logoUrl: string; whiteLabel: boolean }; effective: { brandName: string; logoUrl: string; agencyId: string | null } };
type Created = { name: string; tenantId: string; ownerEmail: string; inviteUrl: string | null; snapshot?: Record<string, number> };

/** Agency console: every client company at a glance, bulk creation, support access, snapshots, branding. */
export function AgencyConsole({ onFlash }: { onFlash: (m: string) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState("");
  const [csv, setCsv] = useState("");
  const [withSnapshot, setWithSnapshot] = useState(true);
  const [created, setCreated] = useState<Created[]>([]);
  const [failed, setFailed] = useState<{ name: string; error: string }[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [brand, setBrand] = useState({ brandName: "", whiteLabel: false });
  const [q, setQ] = useState("");
  const load = async () => { const r = await fetch("/api/agency", { cache: "no-store" }); if (r.ok) { const j: Data = await r.json(); setD(j); setBrand({ brandName: j.branding.brandName, whiteLabel: j.branding.whiteLabel }); } };
  useEffect(() => { void load(); }, []);
  const post = async (body: Record<string, unknown>) => { const r = await fetch("/api/agency", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) { onFlash(j.error || "That didn't work"); return null; } return j; };
  if (!d) return null;
  const rows = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [name, ownerEmail, ownerName] = l.split(/\s*[,\t]\s*/); return { name: name || "", ownerEmail: ownerEmail || "", ownerName: ownerName || "" }; }).filter((r) => r.name && r.ownerEmail);
  const enable = async () => { setBusy("enable"); const j = await post({ action: "enable", brandName: brand.brandName, whiteLabel: brand.whiteLabel }); setBusy(""); if (j) { await load(); onFlash("Agency mode is on"); } };
  const create = async () => {
    if (!rows.length) return onFlash("Add at least one client line: Company name, owner@email.com, Owner name");
    setBusy("create"); const j = await post({ action: "create", clients: rows, snapshotFrom: withSnapshot ? "self" : "" }); setBusy("");
    if (j) { setCreated(j.created || []); setFailed(j.failed || []); setCsv(""); await load(); onFlash(`${(j.created || []).length} client compan${(j.created || []).length === 1 ? "y" : "ies"} created`); }
  };
  const enter = async (c: Client) => { setBusy(c.id); const j = await post({ action: "enter", tenantId: c.id }); setBusy(""); if (j) { window.location.hash = "#crm"; window.location.reload(); } };
  const pushSnapshot = async () => {
    if (!sel.size) return onFlash("Pick the clients to update");
    if (!window.confirm(`Copy this agency's pipelines, calendars, forms, pages and automations into ${sel.size} client${sel.size === 1 ? "" : "s"}? Existing items stay; copies are added.`)) return;
    setBusy("snapshot"); const j = await post({ action: "snapshot", from: "", to: [...sel] }); setBusy("");
    if (j) { setSel(new Set()); onFlash(`Snapshot pushed to ${Object.keys(j.applied || {}).length} client${Object.keys(j.applied || {}).length === 1 ? "" : "s"}`); }
  };
  const copy = async (t: string) => { await navigator.clipboard?.writeText(t); onFlash("Copied"); };
  const list = d.clients.filter((c) => !q || `${c.name} ${c.owner_email || ""}`.toLowerCase().includes(q.toLowerCase()));
  const totals = d.clients.reduce((a, c) => ({ users: a.users + c.users, contacts: a.contacts + c.contacts, pending: a.pending + (c.owner_pending ? 1 : 0), overdue: a.overdue + c.overdue_invoices }), { users: 0, contacts: 0, pending: 0, overdue: 0 });
  if (!d.isAgency) {
    return (
      <div className="agDesk">
        <section className="crmPanel agIntro">
          <small>AGENCY MODE</small><h2>Run many client companies from here</h2>
          <p>Turn this company into an agency and you get a console for every client: health at a glance, bulk creation from a list, one-click support access, snapshots that push your pipelines, calendars, forms and automations to every client, and your brand on their workspaces. Clients are billed to you on the Agency plan.</p>
          {d.role === "OWNER" ? (
            <div className="agEnable">
              <label>Brand name shown to clients<input value={brand.brandName} onChange={(e) => setBrand({ ...brand, brandName: e.target.value })} placeholder="e.g. Northwind Growth Partners" /></label>
              <label className="agCheck"><input type="checkbox" checked={brand.whiteLabel} onChange={(e) => setBrand({ ...brand, whiteLabel: e.target.checked })} /> White label: show my brand instead of Cyncro in client workspaces</label>
              <button className="coSave" disabled={busy === "enable"} onClick={() => void enable()}>{busy === "enable" ? "Turning on…" : "Turn on agency mode"}</button>
            </div>
          ) : <p className="agHint">Ask the company owner to turn this on.</p>}
        </section>
      </div>
    );
  }
  return (
    <div className="agDesk">
      <section className="crmPanel agHead">
        <div><small>AGENCY CONSOLE{d.branding.brandName ? ` · ${d.branding.brandName.toUpperCase()}` : ""}</small><h2>{d.clients.length} client compan{d.clients.length === 1 ? "y" : "ies"}</h2><p>Open any client as support, push your setup to all of them, and watch for owners who haven't accepted their invite.</p></div>
        <div className="agTotals"><span><b>{totals.users}</b><small>users</small></span><span><b>{totals.contacts.toLocaleString()}</b><small>contacts</small></span><span className={totals.pending ? "warn" : ""}><b>{totals.pending}</b><small>invites pending</small></span><span className={totals.overdue ? "warn" : ""}><b>{totals.overdue}</b><small>overdue invoices</small></span></div>
      </section>
      <section className="crmPanel agCreate">
        <div className="crmPanelHead"><div><small>ADD CLIENTS</small><h2>One per line: Company name, owner email, owner name</h2><p>Paste from a spreadsheet. Each owner gets an invite link you can send; you get support access right away.</p></div></div>
        <div className="agCreateGrid">
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"Acme Plumbing, dana@acmeplumbing.com, Dana Ortiz\nBright Dental, lee@brightdental.com, Lee Park"} rows={5} />
          <div className="agCreateSide">
            <label className="agCheck"><input type="checkbox" checked={withSnapshot} onChange={(e) => setWithSnapshot(e.target.checked)} /> Install this agency's setup (pipelines, calendars, forms, pages, automations) into each new client</label>
            <b>{rows.length} ready</b>
            <button className="coSave" disabled={busy === "create" || !rows.length} onClick={() => void create()}>{busy === "create" ? "Creating…" : `Create ${rows.length || ""} client${rows.length === 1 ? "" : "s"}`}</button>
          </div>
        </div>
        {(created.length > 0 || failed.length > 0) && (
          <div className="agResults">
            {created.map((c) => <div key={c.tenantId} className="agResult"><b>{c.name}</b><span>{c.ownerEmail}{c.snapshot ? ` · ${Object.values(c.snapshot).reduce((a, b) => a + b, 0)} items installed` : ""}</span>{c.inviteUrl ? <button className="cyAiMini" onClick={() => void copy(c.inviteUrl!)}>Copy invite link</button> : <em>owner already has an account</em>}</div>)}
            {failed.map((f, i) => <div key={i} className="agResult bad"><b>{f.name}</b><span>{f.error}</span></div>)}
          </div>
        )}
      </section>
      <section className="crmPanel agClients">
        <div className="crmPanelHead"><div><small>CLIENTS</small><h2>Health at a glance</h2></div><div className="cvPaneActions"><input className="agSearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients" />{sel.size > 0 && <button className="coSave" disabled={busy === "snapshot"} onClick={() => void pushSnapshot()}>{busy === "snapshot" ? "Pushing…" : `Push my setup to ${sel.size}`}</button>}</div></div>
        <div className="agTable">
          <header><span><input type="checkbox" checked={sel.size > 0 && sel.size === list.length} onChange={(e) => setSel(e.target.checked ? new Set(list.map((c) => c.id)) : new Set())} aria-label="Select all" /></span><span>Company</span><span>Owner</span><span>Users</span><span>Contacts</span><span>Deals</span><span>Bookings · 7d</span><span>Overdue</span><span>Last activity</span><span /></header>
          {list.map((c) => <div key={c.id} className="agRow">
            <span><input type="checkbox" checked={sel.has(c.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(c.id); else n.delete(c.id); setSel(n); }} aria-label={`Select ${c.name}`} /></span>
            <span><b>{c.name}</b><small>since {new Date(c.created_at).toLocaleDateString()}</small></span>
            <span><b>{c.owner_name || c.owner_email || "—"}</b><small>{c.owner_pending ? <em className="fxPill amber">INVITE PENDING</em> : c.owner_email}</small></span>
            <span>{c.users}</span><span>{c.contacts}</span><span>{c.deals}</span><span>{c.bookings_week}</span><span className={c.overdue_invoices ? "warn" : ""}>{c.overdue_invoices}</span>
            <span><small>{c.last_activity ? new Date(c.last_activity).toLocaleDateString() : "no activity yet"}</small></span>
            <span><button className="cyAiMini" disabled={busy === c.id} onClick={() => void enter(c)}>{busy === c.id ? "Opening…" : "Open"}</button></span>
          </div>)}
          {!list.length && <p className="agEmpty">{d.clients.length ? "No client matches that search." : "No clients yet. Add them above."}</p>}
        </div>
      </section>
    </div>
  );
}
