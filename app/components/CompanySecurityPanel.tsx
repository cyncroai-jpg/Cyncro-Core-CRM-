"use client";
import { useEffect, useState } from "react";

type Member = { email: string; display_name: string; role: string; two_factor: number; sessions: number; last_active: string | null };
type Data = { members: Member[]; locks: { key: string; failures: number; locked_until: string }[]; require2fa: boolean; protections: Record<string, string> };

/** Team Access → Security: what's protecting the company, who has two-factor, require it, export everything. */
export function CompanySecurityPanel({ onFlash, isOwner }: { onFlash: (m: string) => void; isOwner: boolean }) {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState("");
  const load = async () => { const r = await fetch("/api/tenants/security"); if (r.ok) setD(await r.json()); };
  useEffect(() => { void load(); }, []);
  if (!d) return null;
  const toggle = async () => {
    const next = !d.require2fa;
    if (next && !window.confirm("Require two-factor for everyone? Teammates without it will be asked to set it up the next time they open Cyncro.")) return;
    setBusy("req");
    const r = await fetch("/api/tenants/security", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ require2fa: next }) });
    setBusy(""); if (!r.ok) return onFlash("Could not save"); await load(); onFlash(next ? "Two-factor is now required" : "Two-factor is optional again");
  };
  const on = d.members.filter((m) => m.two_factor).length;
  return (
    <section className="crmPanel coSecurity">
      <div className="crmPanelHead"><div><small>SECURITY</small><h2>{on} of {d.members.length} teammates use two-factor</h2><p>What protects this company right now, and the switches an owner controls.</p></div><div className="cvPaneActions">{isOwner && <a className="cyAiMini" href="/api/tenants/export" download>Export all company data</a>}</div></div>
      <div className="secGrid">
        <div className="secBlock">
          <div className="secHead"><div><small>REQUIRE TWO-FACTOR</small><b>{d.require2fa ? "On for everyone" : "Optional"}</b></div>{isOwner && <button className={`fxLendSwitch ${d.require2fa ? "on" : ""}`} disabled={busy === "req"} onClick={() => void toggle()} aria-label="Require two-factor"><i /></button>}</div>
          <ul className="secMembers">
            {d.members.map((m) => <li key={m.email}><b>{m.display_name}</b><span>{m.role.toLowerCase()} · {m.sessions} session{m.sessions === 1 ? "" : "s"}{m.last_active ? ` · active ${new Date(m.last_active).toLocaleDateString()}` : ""}</span><em className={`fxPill ${m.two_factor ? "green" : "amber"}`}>{m.two_factor ? "2FA ON" : "PASSWORD ONLY"}</em></li>)}
          </ul>
          {d.locks.length > 0 && <div className="secLocks"><small>LOCKED RIGHT NOW</small>{d.locks.map((l) => <span key={l.key}>{l.key.replace("login:", "")} · {l.failures} failed · until {new Date(l.locked_until).toLocaleTimeString()}</span>)}</div>}
        </div>
        <div className="secBlock">
          <div className="secHead"><div><small>ALWAYS ON</small><b>Built-in protections</b></div></div>
          <ul className="secList">{Object.entries(d.protections).map(([k, v]) => <li key={k}><i>✓</i><div><b>{k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</b><span>{v}</span></div></li>)}</ul>
        </div>
      </div>
    </section>
  );
}
