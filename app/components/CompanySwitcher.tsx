"use client";
import { useEffect, useRef, useState } from "react";

type Co = { id: string; name: string; role: string; plan: string };

/** Sidebar company block: shows the real company, and switches between companies this login belongs to. */
export function CompanySwitcher({ onFlash }: { onFlash?: (m: string) => void }) {
  const [list, setList] = useState<Co[]>([]);
  const [current, setCurrent] = useState<{ id: string; name: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void Promise.all([fetch("/api/tenants").then((r) => (r.ok ? r.json() : null)), fetch("/api/access").then((r) => (r.ok ? r.json() : null))]).then(([t, a]) => {
      const tenants: Co[] = t?.tenants || []; setList(tenants);
      const id = a?.company?.id; const me = tenants.find((x) => x.id === id);
      if (me) setCurrent({ id: me.id, name: me.name }); else if (tenants[0]) setCurrent({ id: tenants[0].id, name: tenants[0].name });
    }).catch(() => undefined);
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc); return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "C";
  const switchTo = async (c: Co) => {
    if (c.id === current?.id) { setOpen(false); return; }
    setBusy(c.id);
    const r = await fetch("/api/tenants/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: c.id }) });
    setBusy("");
    if (!r.ok) { onFlash?.("Could not switch company"); return; }
    window.location.reload();
  };
  const name = current?.name || "Your company";
  return (
    <div className={`crmWorkspace coSwitch ${open ? "open" : ""}`} ref={ref}>
      <button className="coSwitchBtn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} title={list.length > 1 ? "Switch company" : name}>
        <span>{initials(name)}</span>
        <div><b>{name}</b><small>{list.length > 1 ? `${list.length} companies · switch` : "Company workspace"}</small></div>
        <i>⌄</i>
      </button>
      {open && (
        <ul className="coSwitchMenu" role="listbox">
          {list.map((c) => <li key={c.id} role="option" aria-selected={c.id === current?.id}><button disabled={busy === c.id} onClick={() => void switchTo(c)}><span>{initials(c.name)}</span><div><b>{c.name}</b><small>{c.role.toLowerCase()} · {c.plan}</small></div>{c.id === current?.id && <em>✓</em>}</button></li>)}
          {!list.length && <li className="dim">No companies found.</li>}
        </ul>
      )}
    </div>
  );
}
